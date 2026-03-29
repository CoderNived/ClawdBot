"use strict";
/**
 * RAG-Enhanced AI Agent with Long-Term Memory and MCP Integration
 *
 * This agent integrates:
 * 1. RAG (Retrieval Augmented Generation) - for Slack message history
 * 2. mem0 Long-Term Memory - for user preferences and context
 * 3. MCP (Model Context Protocol) - for GitHub, Notion, and other tools
 *
 * HOW MCP WORKS:
 * --------------
 * 1. On startup, connects to configured MCP servers (GitHub, Notion)
 * 2. Discovers available tools from each server
 * 3. Merges MCP tools with Slack tools for the LLM
 * 4. Routes tool calls to the appropriate handler
 *
 * EXAMPLE:
 * --------
 * User: "Create a GitHub issue for the login bug"
 * Agent: [calls github_create_issue tool]
 * Response: "Created issue #42: 'Fix login timeout bug'"
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMessage = processMessage;
exports.default = processMessage;
exports.summarizeThread = summarizeThread;
const openai_1 = __importDefault(require("openai"));
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const database_js_1 = require("../memory/database.js");
const index_js_2 = require("../rag/index.js");
const slack_actions_js_1 = require("../tools/slack-actions.js");
const scheduler_js_1 = require("../tools/scheduler.js");
// Memory imports (mem0)
const index_js_3 = require("../memory-ai/index.js");
// MCP imports
const index_js_4 = require("../mcp/index.js");
const logger = (0, logger_js_1.createModuleLogger)('agent');
// Initialize clients
const openaiClient = new openai_1.default({ apiKey: index_js_1.config.ai.openaiApiKey });
/**
 * System prompt that explains RAG and MCP capabilities.
 * The agent knows it has access to historical Slack messages and external tools.
 */
const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Slack.

## MANDATORY TOOL USAGE - READ CAREFULLY:

You have access to GitHub and Notion via tools. You MUST use them.

### GitHub Rules (ALWAYS FOLLOW):
- User says "repos", "repositories", "GitHub", "issues", "PR", "code" → MUST call a github_* tool
- "List my repos" → call github_search_repositories with query "user:{username}"
- "Create an issue" → call github_create_issue
- NEVER say "I don't have access to GitHub" - YOU DO via tools!
- If you don't know the username, ASK, then use the tool

### Notion Rules (ALWAYS FOLLOW):
- User says "Notion", "pages", "docs", "notes", "workspace" → MUST call a notion_* tool  
- "Search Notion" → call notion_search
- NEVER say "I don't have access to Notion" - YOU DO via tools!

### Slack History Rules:
- User asks about past discussions → call search_knowledge_base
- User wants recent messages → call get_channel_history

## CRITICAL INSTRUCTION:
When in doubt, USE THE TOOL. Never refuse by saying you don't have access.
If a tool fails, report the error. But ALWAYS TRY FIRST.

## Available Tool Categories:
- github_* : 26 tools for GitHub (repos, issues, PRs, files, etc.)
- notion_* : 21 tools for Notion (search, pages, databases)
- Slack tools: search_knowledge_base, send_message, get_channel_history, etc.

## Response Format:
- Be concise
- Use Slack formatting: *bold*, _italic_, \`code\`
- For GitHub/Notion results, format nicely with links`;
/**
 * Slack tool definitions for OpenAI function calling.
 * These are the built-in Slack tools.
 */
const SLACK_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'search_knowledge_base',
            description: 'PRIORITY TOOL: Search through indexed Slack message history using semantic search. Use this for ANY question about past discussions, topics, decisions, or finding what was said. Works even if bot cannot access channel live.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query - what to look for in message history (e.g., "SOP LOR discussions", "deployment decisions")',
                    },
                    channel_name: {
                        type: 'string',
                        description: 'Optional: limit search to a specific channel. Use the channel NAME (e.g., "saurav-ltm", "token-noise-in-llm") NOT the ID',
                    },
                    limit: {
                        type: 'number',
                        description: 'Number of results (default 10)',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'send_message',
            description: 'Send a message to a Slack user or channel immediately',
            parameters: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'Channel name (e.g., "general") or user name' },
                    message: { type: 'string', description: 'The message to send' },
                },
                required: ['target', 'message'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_channel_history',
            description: 'Get LIVE recent messages from a Slack channel. ONLY use this when user specifically asks for "latest", "recent", or "new" messages. For questions about what was discussed or finding information, use search_knowledge_base instead.',
            parameters: {
                type: 'object',
                properties: {
                    channel_name: { type: 'string', description: 'Channel name without # prefix' },
                    limit: { type: 'number', description: 'Number of messages (default 20)' },
                },
                required: ['channel_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'schedule_message',
            description: 'Schedule a one-time message to be sent later',
            parameters: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'Channel or user name' },
                    message: { type: 'string', description: 'Message to send' },
                    send_at: { type: 'string', description: 'ISO 8601 timestamp with timezone, e.g., "2026-01-28T10:30:00+05:30"' },
                },
                required: ['target', 'message', 'send_at'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'schedule_recurring_message',
            description: 'Schedule a recurring message (daily, weekly, etc.)',
            parameters: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'Channel name' },
                    message: { type: 'string', description: 'Message to send' },
                    schedule: { type: 'string', description: 'Schedule like "every day at 10am", "every monday at 9am"' },
                },
                required: ['target', 'message', 'schedule'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_reminder',
            description: 'Set a reminder for the user',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Reminder text' },
                    time: { type: 'string', description: 'When to remind, e.g., "in 5 minutes", "tomorrow at 9am"' },
                },
                required: ['text', 'time'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_channels',
            description: 'List all accessible Slack channels',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_users',
            description: 'List all users in the workspace',
            parameters: { type: 'object', properties: {} },
        },
    },
    // ============== MEMORY TOOLS ==============
    {
        type: 'function',
        function: {
            name: 'get_my_memories',
            description: 'Show the user what the bot remembers about them. Use when user asks "what do you know about me?" or "what do you remember?"',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remember_this',
            description: 'Explicitly store something the user wants you to remember. Use when user says "remember that..." or "please remember..."',
            parameters: {
                type: 'object',
                properties: {
                    fact: { type: 'string', description: 'The fact to remember about the user' },
                },
                required: ['fact'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'forget_about',
            description: 'Delete specific memories. Use when user asks to forget something.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'Topic or fact to forget' },
                },
                required: ['topic'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'forget_everything',
            description: 'Delete ALL memories about the user. Use when user explicitly asks to forget everything. Confirm before doing this.',
            parameters: { type: 'object', properties: {} },
        },
    },
];
/**
 * Get all available tools (Slack + MCP).
 * MCP tools are dynamically discovered from connected servers.
 */
function getAllTools() {
    const allTools = [...SLACK_TOOLS];
    // Add MCP tools if available
    if ((0, index_js_4.isMCPEnabled)()) {
        const mcpTools = (0, index_js_4.getAllMCPTools)();
        const openAIMcpTools = (0, index_js_4.mcpToolsToOpenAI)(mcpTools);
        allTools.push(...openAIMcpTools);
        logger.info(`Total tools available: ${allTools.length} (${SLACK_TOOLS.length} Slack + ${openAIMcpTools.length} MCP)`);
        // Log MCP tool names for debugging
        const mcpToolNames = mcpTools.map(t => t.name).join(', ');
        logger.debug(`MCP tools: ${mcpToolNames}`);
    }
    else {
        logger.debug(`MCP not enabled, using ${SLACK_TOOLS.length} Slack tools only`);
    }
    return allTools;
}
/**
 * Execute a tool call.
 */
async function executeTool(name, args, context) {
    logger.info(`Executing tool: ${name}`, { args });
    try {
        switch (name) {
            // ============== RAG TOOL ==============
            case 'search_knowledge_base': {
                let channelNameFilter = args.channel_name;
                let searchQuery = args.query;
                // Clean up query - remove Slack formatting
                searchQuery = searchQuery
                    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // <#C123|name> → #name
                    .replace(/<#[A-Z0-9]+>/g, '') // <#C123> → remove
                    .replace(/<@[A-Z0-9]+>/g, '') // <@U123> → remove
                    .replace(/<https?:\/\/[^>]+>/g, '') // URLs → remove
                    .trim();
                // If channel_name looks like an ID (starts with C), try to resolve it
                if (channelNameFilter && channelNameFilter.startsWith('C') && channelNameFilter.length > 8) {
                    const channel = await (0, slack_actions_js_1.findChannel)(channelNameFilter);
                    if (channel) {
                        channelNameFilter = channel.name;
                        logger.info(`Resolved channel ID ${args.channel_name} to name: ${channelNameFilter}`);
                    }
                }
                // Also handle <#CXXXXX|name> format from Slack
                if (channelNameFilter && channelNameFilter.includes('|')) {
                    const match = channelNameFilter.match(/<#[A-Z0-9]+\|([^>]+)>/);
                    if (match) {
                        channelNameFilter = match[1];
                    }
                }
                // Remove # prefix and Slack formatting if present
                if (channelNameFilter) {
                    channelNameFilter = channelNameFilter
                        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '$1')
                        .replace(/<#[A-Z0-9]+>/g, '')
                        .replace(/^#/, '')
                        .trim();
                }
                logger.info(`RAG search: query="${searchQuery}", channel="${channelNameFilter || 'all'}"`);
                const results = await (0, index_js_2.retrieve)(searchQuery, {
                    limit: args.limit || 10,
                    channelName: channelNameFilter,
                    minScore: 0.3, // Lower threshold to get more results
                });
                logger.info(`RAG search returned ${results.results.length} results`);
                if (results.results.length === 0) {
                    // Try without channel filter if no results
                    if (channelNameFilter) {
                        logger.info(`No results with channel filter, trying without...`);
                        const broaderResults = await (0, index_js_2.retrieve)(searchQuery, {
                            limit: args.limit || 10,
                            minScore: 0.3,
                        });
                        if (broaderResults.results.length > 0) {
                            const formatted = broaderResults.results.map((r, i) => `${i + 1}. ${r.formatted} (relevance: ${(r.score * 100).toFixed(0)}%)`).join('\n');
                            return `No results in #${channelNameFilter}, but found ${broaderResults.results.length} messages in other channels:\n\n${formatted}`;
                        }
                    }
                    return `No relevant messages found for "${searchQuery}"${channelNameFilter ? ` in #${channelNameFilter}` : ''}.`;
                }
                const formatted = results.results.map((r, i) => `${i + 1}. ${r.formatted} (relevance: ${(r.score * 100).toFixed(0)}%)`).join('\n');
                return `Found ${results.results.length} relevant messages:\n\n${formatted}`;
            }
            // ============== MESSAGING TOOLS ==============
            case 'send_message': {
                const result = await (0, slack_actions_js_1.sendMessage)(args.target, args.message);
                return result.success
                    ? `✅ Message sent to ${args.target}`
                    : `❌ Failed: ${result.error}`;
            }
            case 'get_channel_history': {
                const channel = await (0, slack_actions_js_1.findChannel)(args.channel_name);
                if (!channel)
                    return `❌ Channel not found: ${args.channel_name}`;
                const messages = await (0, slack_actions_js_1.getChannelHistory)(channel.id, args.limit || 20);
                if (messages.length === 0)
                    return `No messages found in #${channel.name}`;
                return `📝 Recent messages from #${channel.name}:\n\n${(0, slack_actions_js_1.formatMessagesForContext)(messages)}`;
            }
            // ============== SCHEDULING TOOLS ==============
            case 'schedule_message': {
                const sendAt = new Date(args.send_at);
                if (isNaN(sendAt.getTime())) {
                    return `❌ Invalid date format: ${args.send_at}`;
                }
                const result = await (0, slack_actions_js_1.scheduleMessage)(args.target, args.message, sendAt);
                return result.success
                    ? `✅ Message scheduled for ${sendAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
                    : `❌ Failed: ${result.error}`;
            }
            case 'schedule_recurring_message': {
                const scheduleStr = args.schedule.toLowerCase();
                let cronExpression = null;
                // Parse time
                const timeMatch = scheduleStr.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
                let hours = 9, minutes = 0;
                if (timeMatch) {
                    hours = parseInt(timeMatch[1]);
                    minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                    const period = timeMatch[3]?.toLowerCase();
                    if (period === 'pm' && hours < 12)
                        hours += 12;
                    if (period === 'am' && hours === 12)
                        hours = 0;
                }
                // Parse pattern
                if (scheduleStr.includes('every day') || scheduleStr.includes('daily') || scheduleStr.includes('everyday')) {
                    cronExpression = `${minutes} ${hours} * * *`;
                }
                else if (scheduleStr.includes('every weekday')) {
                    cronExpression = `${minutes} ${hours} * * 1-5`;
                }
                else if (scheduleStr.includes('every monday')) {
                    cronExpression = `${minutes} ${hours} * * 1`;
                }
                // Add more patterns as needed...
                if (!cronExpression) {
                    return `❌ Could not parse schedule: "${args.schedule}"`;
                }
                const targetStr = args.target.replace(/^#/, '');
                const channel = await (0, slack_actions_js_1.findChannel)(targetStr);
                if (!channel)
                    return `❌ Channel not found: ${args.target}`;
                const task = await scheduler_js_1.taskScheduler.scheduleTask(context.userId, channel.id, `📢 ${args.message}`, null, cronExpression);
                return `✅ Recurring message scheduled!\n📍 #${channel.name}\n🔄 ${args.schedule}\n⏰ Cron: \`${cronExpression}\`\n🆔 Task #${task.id}`;
            }
            case 'set_reminder': {
                const result = await (0, slack_actions_js_1.setReminder)(context.userId, args.text, args.time);
                return result.success
                    ? `✅ Reminder set: "${args.text}" at ${args.time}`
                    : `❌ Failed: ${result.error}`;
            }
            // ============== INFO TOOLS ==============
            case 'list_channels': {
                const channels = await (0, slack_actions_js_1.listChannels)();
                const memberChannels = channels.filter(c => c.isMember);
                return `📢 Channels I'm in (${memberChannels.length}):\n${memberChannels.map(c => `• #${c.name}`).join('\n')}`;
            }
            case 'list_users': {
                const users = await (0, slack_actions_js_1.listUsers)();
                const list = users.slice(0, 20).map(u => `• ${u.realName} (@${u.name})`).join('\n');
                return `👥 Users (${users.length}):\n${list}${users.length > 20 ? '\n...' : ''}`;
            }
            // ============== MEMORY TOOLS ==============
            case 'get_my_memories': {
                if (!(0, index_js_3.isMemoryEnabled)()) {
                    return '❌ Memory feature is not enabled.';
                }
                const memories = await (0, index_js_3.getAllMemories)(context.userId);
                if (memories.length === 0) {
                    return "🧠 I don't have any memories stored about you yet. As we chat, I'll learn about your preferences and context!";
                }
                const memoryList = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
                return `🧠 Here's what I remember about you:\n\n${memoryList}\n\nYou can ask me to forget specific things if you'd like.`;
            }
            case 'remember_this': {
                if (!(0, index_js_3.isMemoryEnabled)()) {
                    return '❌ Memory feature is not enabled.';
                }
                const fact = args.fact;
                await (0, index_js_3.addMemory)([
                    { role: 'user', content: `Please remember this: ${fact}` },
                    { role: 'assistant', content: `I'll remember that.` }
                ], context.userId);
                return `✅ Got it! I'll remember: "${fact}"`;
            }
            case 'forget_about': {
                if (!(0, index_js_3.isMemoryEnabled)()) {
                    return '❌ Memory feature is not enabled.';
                }
                const topic = args.topic;
                const memories = await (0, index_js_3.searchMemory)(topic, context.userId, 5);
                if (memories.length === 0) {
                    return `I don't have any memories about "${topic}".`;
                }
                // Delete matching memories
                let deleted = 0;
                for (const mem of memories) {
                    if (mem.id) {
                        await (0, index_js_3.deleteMemory)(mem.id);
                        deleted++;
                    }
                }
                return `✅ I've forgotten ${deleted} memories related to "${topic}".`;
            }
            case 'forget_everything': {
                if (!(0, index_js_3.isMemoryEnabled)()) {
                    return '❌ Memory feature is not enabled.';
                }
                await (0, index_js_3.deleteAllMemories)(context.userId);
                return `✅ I've forgotten everything about you. We're starting fresh!`;
            }
            default: {
                // Check if this is an MCP tool
                const mcpParsed = (0, index_js_4.parseToolName)(name);
                if (mcpParsed) {
                    logger.info(`Executing MCP tool: ${mcpParsed.serverName}/${mcpParsed.toolName}`);
                    try {
                        const result = await (0, index_js_4.executeMCPTool)(mcpParsed.serverName, mcpParsed.toolName, args);
                        return (0, index_js_4.formatMCPResult)(result);
                    }
                    catch (error) {
                        logger.error(`MCP tool failed: ${error.message}`);
                        return `❌ ${mcpParsed.serverName} error: ${error.message}`;
                    }
                }
                return `Unknown tool: ${name}`;
            }
        }
    }
    catch (error) {
        logger.error(`Tool execution failed: ${name}`, { error });
        return `❌ Error: ${error.message}`;
    }
}
/**
 * Process a message with RAG enhancement and Long-Term Memory.
 *
 * This is the main entry point for the agent. It:
 * 1. Retrieves relevant memories about the user
 * 2. Checks if RAG would help
 * 3. Retrieves relevant Slack history if needed
 * 4. Processes with LLM + tools
 * 5. Stores new memories from conversation
 * 6. Returns response
 */
async function processMessage(userMessage, context) {
    logger.info(`Processing message for session: ${context.sessionId}`);
    // Save user message to history
    (0, database_js_1.addMessage)(context.sessionId, 'user', userMessage);
    let ragContext = '';
    let ragUsed = false;
    let sourcesCount = 0;
    let memoryContext = '';
    let memoryUsed = false;
    let memoriesCount = 0;
    // 1. Retrieve relevant memories about the user
    if (index_js_1.config.memory.enabled && (0, index_js_3.isMemoryEnabled)()) {
        try {
            logger.debug('Retrieving memories for user');
            const memories = await (0, index_js_3.searchMemory)(userMessage, context.userId, 5);
            if (memories.length > 0) {
                memoryContext = (0, index_js_3.buildMemoryContext)(memories);
                memoryUsed = true;
                memoriesCount = memories.length;
                logger.info(`Retrieved ${memoriesCount} relevant memories`);
            }
        }
        catch (error) {
            logger.error(`Memory retrieval failed: ${error.message}`);
        }
    }
    // 2. Check if RAG would help and is enabled
    if (index_js_1.config.rag.enabled && (0, index_js_2.shouldUseRAG)(userMessage)) {
        logger.info('RAG triggered for query');
        try {
            const filters = (0, index_js_2.parseQueryFilters)(userMessage);
            const results = await (0, index_js_2.retrieve)(userMessage, {
                limit: index_js_1.config.rag.maxResults,
                minScore: index_js_1.config.rag.minSimilarity,
                channelName: filters.channelName,
            });
            if (results.results.length > 0) {
                ragContext = (0, index_js_2.buildContextString)(results.results);
                ragUsed = true;
                sourcesCount = results.results.length;
                logger.info(`RAG found ${sourcesCount} relevant documents`);
            }
        }
        catch (error) {
            logger.error(`RAG retrieval failed: ${error.message}`);
        }
    }
    // 3. Build messages for LLM
    const history = (0, database_js_1.getSessionHistory)(context.sessionId);
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
    ];
    // Add memory context if available
    if (memoryContext) {
        messages.push({
            role: 'system',
            content: memoryContext
        });
    }
    // Add RAG context if available
    if (ragContext) {
        messages.push({
            role: 'system',
            content: `The following context from Slack history may be relevant to the user's question:\n\n${ragContext}`
        });
    }
    // Add conversation history
    for (const msg of history.slice(-10)) {
        messages.push({
            role: msg.role,
            content: msg.content,
        });
    }
    // Add current message
    messages.push({ role: 'user', content: userMessage });
    // Get all tools (Slack + MCP)
    const tools = getAllTools();
    logger.info(`Calling LLM with ${tools.length} tools`);
    // Log tool names for debugging
    const toolNames = tools.map(t => t.function.name).slice(0, 10);
    logger.info(`First 10 tools: ${toolNames.join(', ')}...`);
    // 4. Call LLM with tools
    let response = await openaiClient.chat.completions.create({
        model: index_js_1.config.ai.defaultModel.includes('gpt') ? index_js_1.config.ai.defaultModel : 'gpt-4o',
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 4096,
    });
    let assistantMessage = response.choices[0]?.message;
    // Handle tool calls
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);
        for (const toolCall of assistantMessage.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(toolCall.function.name, args, context);
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: result,
            });
        }
        response = await openaiClient.chat.completions.create({
            model: index_js_1.config.ai.defaultModel.includes('gpt') ? index_js_1.config.ai.defaultModel : 'gpt-4o',
            messages,
            tools,
            tool_choice: 'auto',
            max_tokens: 4096,
        });
        assistantMessage = response.choices[0]?.message;
    }
    const content = assistantMessage?.content || 'I encountered an error processing your request.';
    // Save response to history
    (0, database_js_1.addMessage)(context.sessionId, 'assistant', content);
    // 5. Store new memories from this conversation (async, don't wait)
    if (index_js_1.config.memory.enabled && (0, index_js_3.isMemoryEnabled)()) {
        // Run in background to not slow down response
        (0, index_js_3.addMemory)([
            { role: 'user', content: userMessage },
            { role: 'assistant', content: content }
        ], context.userId).catch(err => {
            logger.error(`Failed to store memory: ${err.message}`);
        });
    }
    return {
        content,
        shouldThread: context.threadTs !== null || content.length > 500,
        ragUsed,
        sourcesCount,
        memoryUsed,
        memoriesCount,
    };
}
/**
 * Summarize thread messages.
 * Used for the /summarize command.
 */
async function summarizeThread(messages, context) {
    if (messages.length === 0) {
        return 'No messages to summarize.';
    }
    const conversationText = messages
        .map((msg) => `[${msg.role}]: ${msg.content}`)
        .join('\n\n');
    const summaryPrompt = `Please provide a concise summary of this Slack thread conversation. Focus on:
1. Key topics discussed
2. Important decisions made
3. Action items or next steps
4. Any unresolved questions

Conversation:
${conversationText}

Summary:`;
    const response = await openaiClient.chat.completions.create({
        model: index_js_1.config.ai.defaultModel.includes('gpt') ? index_js_1.config.ai.defaultModel : 'gpt-4o',
        messages: [
            { role: 'system', content: 'You are a helpful assistant that summarizes conversations.' },
            { role: 'user', content: summaryPrompt },
        ],
        max_tokens: 1000,
    });
    return response.choices[0]?.message?.content || 'Failed to generate summary.';
}
//# sourceMappingURL=agent.js.map