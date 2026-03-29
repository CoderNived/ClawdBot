"use strict";
/**
 * Memory Module Index
 *
 * Exports all memory functionality for the Slack AI Assistant.
 *
 * QUICK START:
 * ------------
 *
 * 1. Initialize memory:
 *    ```typescript
 *    import { initializeMemory } from './memory-ai';
 *    await initializeMemory();
 *    ```
 *
 * 2. Store memories from conversation:
 *    ```typescript
 *    import { addMemory } from './memory-ai';
 *    await addMemory(messages, userId);
 *    ```
 *
 * 3. Retrieve relevant memories:
 *    ```typescript
 *    import { searchMemory, buildMemoryContext } from './memory-ai';
 *    const memories = await searchMemory(query, userId);
 *    const context = buildMemoryContext(memories);
 *    ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemoryStatus = exports.isMemoryEnabled = exports.buildMemoryContext = exports.deleteAllMemories = exports.deleteMemory = exports.getAllMemories = exports.searchMemory = exports.addMemory = exports.initializeMemory = void 0;
var mem0_client_js_1 = require("./mem0-client.js");
Object.defineProperty(exports, "initializeMemory", { enumerable: true, get: function () { return mem0_client_js_1.initializeMemory; } });
Object.defineProperty(exports, "addMemory", { enumerable: true, get: function () { return mem0_client_js_1.addMemory; } });
Object.defineProperty(exports, "searchMemory", { enumerable: true, get: function () { return mem0_client_js_1.searchMemory; } });
Object.defineProperty(exports, "getAllMemories", { enumerable: true, get: function () { return mem0_client_js_1.getAllMemories; } });
Object.defineProperty(exports, "deleteMemory", { enumerable: true, get: function () { return mem0_client_js_1.deleteMemory; } });
Object.defineProperty(exports, "deleteAllMemories", { enumerable: true, get: function () { return mem0_client_js_1.deleteAllMemories; } });
Object.defineProperty(exports, "buildMemoryContext", { enumerable: true, get: function () { return mem0_client_js_1.buildMemoryContext; } });
Object.defineProperty(exports, "isMemoryEnabled", { enumerable: true, get: function () { return mem0_client_js_1.isMemoryEnabled; } });
Object.defineProperty(exports, "getMemoryStatus", { enumerable: true, get: function () { return mem0_client_js_1.getMemoryStatus; } });
//# sourceMappingURL=index.js.map