"use strict";
/**
 * mem0 Memory Client
 *
 * This module integrates mem0.ai for long-term user memory.
 * mem0 automatically extracts facts from conversations and stores them,
 * enabling personalized AI experiences across sessions.
 *
 * HOW IT WORKS:
 * -------------
 * 1. After each conversation, we pass messages to mem0
 * 2. mem0 uses an LLM to extract facts (e.g., "User is working on Q4 launch")
 * 3. Facts are stored in a vector database for semantic retrieval
 * 4. Before responding, we retrieve relevant memories for context
 *
 * EXAMPLE:
 * --------
 * Conversation: "I'm Alex, a senior engineer working on payments"
 *
 * mem0 extracts:
 * - "Name is Alex"
 * - "Role is senior engineer"
 * - "Working on payments project"
 *
 * Later query: "What should I focus on?"
 * Retrieves: memories about current project → personalized response
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeMemory = initializeMemory;
exports.addMemory = addMemory;
exports.searchMemory = searchMemory;
exports.getAllMemories = getAllMemories;
exports.deleteMemory = deleteMemory;
exports.deleteAllMemories = deleteAllMemories;
exports.buildMemoryContext = buildMemoryContext;
exports.isMemoryEnabled = isMemoryEnabled;
exports.getMemoryStatus = getMemoryStatus;
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createModuleLogger)('mem0-client');
// Memory client instance
let memoryInstance = null;
let isInitialized = false;
/**
 * Initialize the mem0 memory client.
 *
 * Uses mem0 Cloud API with MEM0_API_KEY.
 */
async function initializeMemory() {
    if (isInitialized) {
        logger.debug('Memory already initialized');
        return;
    }
    try {
        logger.info('Initializing mem0 cloud client...');
        const apiKey = process.env.MEM0_API_KEY;
        if (!apiKey) {
            throw new Error('MEM0_API_KEY environment variable is required');
        }
        // Import mem0ai MemoryClient for cloud API
        const mem0Module = await Promise.resolve().then(() => __importStar(require('mem0ai')));
        const MemoryClient = mem0Module.default || mem0Module.MemoryClient;
        if (!MemoryClient) {
            throw new Error('MemoryClient not found in mem0ai package');
        }
        // Initialize cloud client
        memoryInstance = new MemoryClient({ apiKey });
        isInitialized = true;
        logger.info('✅ mem0 cloud client initialized');
    }
    catch (error) {
        logger.error(`Failed to initialize mem0: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);
        logger.warn('Memory features will be disabled');
        isInitialized = false;
    }
}
/**
 * Add memories from a conversation.
 * mem0 will automatically extract facts from the messages.
 *
 * @param messages - Conversation messages
 * @param userId - Slack user ID
 * @param metadata - Optional metadata
 *
 * @example
 * await addMemory([
 *   { role: 'user', content: "I'm working on the API redesign" },
 *   { role: 'assistant', content: "Great! How can I help with the API?" }
 * ], 'U12345');
 * // Extracts: "User is working on API redesign"
 */
async function addMemory(messages, userId, metadata) {
    if (!isInitialized || !memoryInstance) {
        logger.warn('Memory not initialized, skipping add');
        return [];
    }
    try {
        logger.debug(`Adding memories for user ${userId}`);
        const result = await memoryInstance.add(messages, {
            user_id: userId, // Cloud API uses user_id
            metadata: {
                source: 'slack',
                ...metadata,
            },
        });
        const memories = result?.results || result || [];
        if (memories.length > 0) {
            logger.info(`Stored ${memories.length} memories for user ${userId}`);
            memories.forEach((m) => {
                logger.debug(`  - ${m.memory}`);
            });
        }
        return memories;
    }
    catch (error) {
        logger.error(`Failed to add memory: ${error.message}`);
        return [];
    }
}
/**
 * Search for relevant memories.
 * Uses semantic search to find memories related to the query.
 *
 * @param query - Search query
 * @param userId - Slack user ID
 * @param limit - Max results
 *
 * @example
 * const memories = await searchMemory("current project", "U12345");
 * // Returns: [{ memory: "User is working on API redesign", score: 0.89 }]
 */
async function searchMemory(query, userId, limit = 5) {
    if (!isInitialized || !memoryInstance) {
        logger.warn('Memory not initialized, skipping search');
        return [];
    }
    try {
        logger.debug(`Searching memories for user ${userId}: "${query.substring(0, 50)}..."`);
        const result = await memoryInstance.search(query, {
            user_id: userId, // Cloud API uses user_id
            limit,
        });
        const memories = result?.results || [];
        logger.debug(`Found ${memories.length} relevant memories`);
        return memories;
    }
    catch (error) {
        logger.error(`Failed to search memory: ${error.message}`);
        return [];
    }
}
/**
 * Get all memories for a user.
 *
 * @param userId - Slack user ID
 */
async function getAllMemories(userId) {
    if (!isInitialized || !memoryInstance) {
        logger.warn('Memory not initialized, skipping getAll');
        return [];
    }
    try {
        logger.debug(`Getting all memories for user ${userId}`);
        const result = await memoryInstance.getAll({ user_id: userId }); // Cloud API uses user_id
        const memories = result?.results || result || [];
        logger.debug(`User ${userId} has ${memories.length} memories`);
        return memories;
    }
    catch (error) {
        logger.error(`Failed to get memories: ${error.message}`);
        return [];
    }
}
/**
 * Delete a specific memory.
 *
 * @param memoryId - Memory ID to delete
 */
async function deleteMemory(memoryId) {
    if (!isInitialized || !memoryInstance) {
        logger.warn('Memory not initialized, skipping delete');
        return false;
    }
    try {
        logger.debug(`Deleting memory: ${memoryId}`);
        await memoryInstance.delete(memoryId);
        logger.info(`Deleted memory: ${memoryId}`);
        return true;
    }
    catch (error) {
        logger.error(`Failed to delete memory: ${error.message}`);
        return false;
    }
}
/**
 * Delete all memories for a user.
 *
 * @param userId - Slack user ID
 */
async function deleteAllMemories(userId) {
    if (!isInitialized || !memoryInstance) {
        logger.warn('Memory not initialized, skipping deleteAll');
        return false;
    }
    try {
        logger.debug(`Deleting all memories for user ${userId}`);
        await memoryInstance.deleteAll({ user_id: userId }); // Cloud API uses user_id
        logger.info(`Deleted all memories for user ${userId}`);
        return true;
    }
    catch (error) {
        logger.error(`Failed to delete all memories: ${error.message}`);
        return false;
    }
}
/**
 * Build a context string from memories for the LLM.
 *
 * @param memories - Array of memories
 * @returns Formatted context string
 */
function buildMemoryContext(memories) {
    if (memories.length === 0) {
        return '';
    }
    const header = '## What I Remember About You\n\n';
    const items = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
    const footer = '\n\nUse this context to personalize your responses.';
    return header + items + footer;
}
/**
 * Check if memory is initialized and available.
 */
function isMemoryEnabled() {
    return isInitialized && memoryInstance !== null;
}
/**
 * Get memory system status.
 */
function getMemoryStatus() {
    return {
        enabled: index_js_1.config.memory?.enabled ?? true,
        initialized: isInitialized,
    };
}
//# sourceMappingURL=mem0-client.js.map