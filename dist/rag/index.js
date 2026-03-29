"use strict";
/**
 * RAG Module Index
 *
 * Exports all RAG (Retrieval Augmented Generation) functionality.
 *
 * QUICK START:
 * ------------
 *
 * 1. Initialize the RAG system:
 *    ```typescript
 *    import { initializeVectorStore, startIndexer } from './rag';
 *
 *    await initializeVectorStore();
 *    startIndexer(); // Background indexing
 *    ```
 *
 * 2. Search for relevant context:
 *    ```typescript
 *    import { retrieve, buildContextString, shouldUseRAG } from './rag';
 *
 *    if (shouldUseRAG(userQuery)) {
 *      const results = await retrieve(userQuery);
 *      const context = buildContextString(results.results);
 *      // Add context to LLM prompt
 *    }
 *    ```
 *
 * 3. Manually index a message:
 *    ```typescript
 *    import { indexSingleMessage } from './rag';
 *
 *    await indexSingleMessage(message, channelId, channelName);
 *    ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseQueryFilters = exports.shouldUseRAG = exports.buildContextString = exports.retrieveContext = exports.retrieve = exports.getIndexerStatus = exports.indexSingleMessage = exports.indexChannelManually = exports.runIndex = exports.stopIndexer = exports.startIndexer = exports.clearAll = exports.getDocuments = exports.documentExists = exports.getDocumentCount = exports.search = exports.deleteDocuments = exports.updateDocuments = exports.addDocuments = exports.initializeVectorStore = exports.getEmbeddingConfig = exports.preprocessText = exports.cosineSimilarity = exports.createEmbeddings = exports.createEmbedding = void 0;
// Embeddings - Convert text to vectors
var embeddings_js_1 = require("./embeddings.js");
Object.defineProperty(exports, "createEmbedding", { enumerable: true, get: function () { return embeddings_js_1.createEmbedding; } });
Object.defineProperty(exports, "createEmbeddings", { enumerable: true, get: function () { return embeddings_js_1.createEmbeddings; } });
Object.defineProperty(exports, "cosineSimilarity", { enumerable: true, get: function () { return embeddings_js_1.cosineSimilarity; } });
Object.defineProperty(exports, "preprocessText", { enumerable: true, get: function () { return embeddings_js_1.preprocessText; } });
Object.defineProperty(exports, "getEmbeddingConfig", { enumerable: true, get: function () { return embeddings_js_1.getEmbeddingConfig; } });
// Vector Store - Store and search vectors
var vectorstore_js_1 = require("./vectorstore.js");
Object.defineProperty(exports, "initializeVectorStore", { enumerable: true, get: function () { return vectorstore_js_1.initializeVectorStore; } });
Object.defineProperty(exports, "addDocuments", { enumerable: true, get: function () { return vectorstore_js_1.addDocuments; } });
Object.defineProperty(exports, "updateDocuments", { enumerable: true, get: function () { return vectorstore_js_1.updateDocuments; } });
Object.defineProperty(exports, "deleteDocuments", { enumerable: true, get: function () { return vectorstore_js_1.deleteDocuments; } });
Object.defineProperty(exports, "search", { enumerable: true, get: function () { return vectorstore_js_1.search; } });
Object.defineProperty(exports, "getDocumentCount", { enumerable: true, get: function () { return vectorstore_js_1.getDocumentCount; } });
Object.defineProperty(exports, "documentExists", { enumerable: true, get: function () { return vectorstore_js_1.documentExists; } });
Object.defineProperty(exports, "getDocuments", { enumerable: true, get: function () { return vectorstore_js_1.getDocuments; } });
Object.defineProperty(exports, "clearAll", { enumerable: true, get: function () { return vectorstore_js_1.clearAll; } });
// Indexer - Background message indexing
var indexer_js_1 = require("./indexer.js");
Object.defineProperty(exports, "startIndexer", { enumerable: true, get: function () { return indexer_js_1.startIndexer; } });
Object.defineProperty(exports, "stopIndexer", { enumerable: true, get: function () { return indexer_js_1.stopIndexer; } });
Object.defineProperty(exports, "runIndex", { enumerable: true, get: function () { return indexer_js_1.runIndex; } });
Object.defineProperty(exports, "indexChannelManually", { enumerable: true, get: function () { return indexer_js_1.indexChannelManually; } });
Object.defineProperty(exports, "indexSingleMessage", { enumerable: true, get: function () { return indexer_js_1.indexSingleMessage; } });
Object.defineProperty(exports, "getIndexerStatus", { enumerable: true, get: function () { return indexer_js_1.getIndexerStatus; } });
// Retriever - Semantic search
var retriever_js_1 = require("./retriever.js");
Object.defineProperty(exports, "retrieve", { enumerable: true, get: function () { return retriever_js_1.retrieve; } });
Object.defineProperty(exports, "retrieveContext", { enumerable: true, get: function () { return retriever_js_1.retrieveContext; } });
Object.defineProperty(exports, "buildContextString", { enumerable: true, get: function () { return retriever_js_1.buildContextString; } });
Object.defineProperty(exports, "shouldUseRAG", { enumerable: true, get: function () { return retriever_js_1.shouldUseRAG; } });
Object.defineProperty(exports, "parseQueryFilters", { enumerable: true, get: function () { return retriever_js_1.parseQueryFilters; } });
//# sourceMappingURL=index.js.map