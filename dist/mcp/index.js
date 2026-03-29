"use strict";
/**
 * MCP (Model Context Protocol) Module
 *
 * Provides integration with MCP servers like GitHub and Notion.
 *
 * QUICK START:
 * ------------
 *
 * 1. Configure MCP servers (see mcp-config.json or .env)
 *
 * 2. Initialize MCP:
 *    ```typescript
 *    import { initializeMCP } from './mcp';
 *    await initializeMCP();
 *    ```
 *
 * 3. Get available tools:
 *    ```typescript
 *    import { getAllMCPTools, mcpToolsToOpenAI } from './mcp';
 *    const mcpTools = getAllMCPTools();
 *    const openAITools = mcpToolsToOpenAI(mcpTools);
 *    ```
 *
 * 4. Execute tools:
 *    ```typescript
 *    import { executeMCPTool, parseToolName } from './mcp';
 *    const parsed = parseToolName('github_create_issue');
 *    const result = await executeMCPTool(parsed.serverName, parsed.toolName, args);
 *    ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMCPResult = exports.mcpToolsToOpenAI = exports.mcpToolToOpenAI = exports.validateMCPConfig = exports.loadMCPConfig = exports.getConnectedServers = exports.isMCPEnabled = exports.parseToolName = exports.executeMCPTool = exports.getAllMCPTools = exports.shutdownMCP = exports.initializeMCP = void 0;
var client_js_1 = require("./client.js");
Object.defineProperty(exports, "initializeMCP", { enumerable: true, get: function () { return client_js_1.initializeMCP; } });
Object.defineProperty(exports, "shutdownMCP", { enumerable: true, get: function () { return client_js_1.shutdownMCP; } });
Object.defineProperty(exports, "getAllMCPTools", { enumerable: true, get: function () { return client_js_1.getAllMCPTools; } });
Object.defineProperty(exports, "executeMCPTool", { enumerable: true, get: function () { return client_js_1.executeMCPTool; } });
Object.defineProperty(exports, "parseToolName", { enumerable: true, get: function () { return client_js_1.parseToolName; } });
Object.defineProperty(exports, "isMCPEnabled", { enumerable: true, get: function () { return client_js_1.isMCPEnabled; } });
Object.defineProperty(exports, "getConnectedServers", { enumerable: true, get: function () { return client_js_1.getConnectedServers; } });
var config_js_1 = require("./config.js");
Object.defineProperty(exports, "loadMCPConfig", { enumerable: true, get: function () { return config_js_1.loadMCPConfig; } });
Object.defineProperty(exports, "validateMCPConfig", { enumerable: true, get: function () { return config_js_1.validateMCPConfig; } });
var tool_converter_js_1 = require("./tool-converter.js");
Object.defineProperty(exports, "mcpToolToOpenAI", { enumerable: true, get: function () { return tool_converter_js_1.mcpToolToOpenAI; } });
Object.defineProperty(exports, "mcpToolsToOpenAI", { enumerable: true, get: function () { return tool_converter_js_1.mcpToolsToOpenAI; } });
Object.defineProperty(exports, "formatMCPResult", { enumerable: true, get: function () { return tool_converter_js_1.formatMCPResult; } });
//# sourceMappingURL=index.js.map