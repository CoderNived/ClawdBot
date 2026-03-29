"use strict";
/**
 * Vector Store Module
 *
 * This module manages the ChromaDB vector database for storing and searching
 * message embeddings. ChromaDB is a local vector database that allows us to
 * perform similarity searches without needing external cloud services.
 *
 * WHY CHROMADB?
 * -------------
 * - Runs locally (no cloud dependency)
 * - Persistent storage (survives restarts)
 * - Easy to set up and use
 * - Good performance for small-medium datasets (< 1M documents)
 * - Free and open source
 *
 * For larger scale (> 1M documents), consider:
 * - Pinecone (cloud, managed)
 * - Weaviate (self-hosted or cloud)
 * - Milvus (self-hosted)
 *
 * HOW IT WORKS:
 * -------------
 * 1. Store: Save embedding + text + metadata
 * 2. Search: Find vectors closest to a query vector
 * 3. Filter: Narrow results by metadata (channel, user, date)
 *
 * DATA MODEL:
 * -----------
 * Each document in the store has:
 * - id: Unique identifier (Slack message timestamp)
 * - embedding: Vector representation (1536 floats)
 * - text: Original message text
 * - metadata: Channel, user, timestamp, etc.
 *
 * NOTE: We use an in-memory store with manual persistence for simplicity.
 * For production with large datasets, consider running a ChromaDB server.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeVectorStore = initializeVectorStore;
exports.addDocuments = addDocuments;
exports.updateDocuments = updateDocuments;
exports.deleteDocuments = deleteDocuments;
exports.search = search;
exports.getDocumentCount = getDocumentCount;
exports.documentExists = documentExists;
exports.getDocuments = getDocuments;
exports.clearAll = clearAll;
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const embeddings_js_1 = require("./embeddings.js");
const fs_1 = require("fs");
const path_1 = require("path");
const logger = (0, logger_js_1.createModuleLogger)('vectorstore');
// Collection name for Slack messages
const COLLECTION_NAME = 'slack_messages';
/**
 * Simple in-memory vector store with file persistence.
 * This is a lightweight alternative to running a ChromaDB server.
 */
class SimpleVectorStore {
    constructor(persistPath) {
        this.documents = new Map();
        this.initialized = false;
        this.persistPath = persistPath;
    }
    async initialize() {
        if (this.initialized)
            return;
        // Ensure directory exists
        const dir = (0, path_1.dirname)(this.persistPath);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        // Load existing data if available
        if ((0, fs_1.existsSync)(this.persistPath)) {
            try {
                const data = (0, fs_1.readFileSync)(this.persistPath, 'utf-8');
                const parsed = JSON.parse(data);
                this.documents = new Map(Object.entries(parsed));
                logger.info(`Loaded ${this.documents.size} documents from disk`);
            }
            catch (error) {
                logger.warn(`Could not load existing data: ${error.message}`);
                this.documents = new Map();
            }
        }
        this.initialized = true;
    }
    persist() {
        try {
            const data = Object.fromEntries(this.documents);
            (0, fs_1.writeFileSync)(this.persistPath, JSON.stringify(data));
        }
        catch (error) {
            logger.error(`Failed to persist data: ${error.message}`);
        }
    }
    async add(documents) {
        for (const doc of documents) {
            this.documents.set(doc.id, doc);
        }
        this.persist();
    }
    async update(documents) {
        for (const doc of documents) {
            if (this.documents.has(doc.id)) {
                this.documents.set(doc.id, doc);
            }
        }
        this.persist();
    }
    async delete(ids) {
        for (const id of ids) {
            this.documents.delete(id);
        }
        this.persist();
    }
    async search(queryEmbedding, options = {}) {
        const { limit = 10, channelId, channelName, userId } = options;
        // Calculate similarity for all documents
        const results = [];
        for (const doc of this.documents.values()) {
            // Apply filters (case-insensitive for channel and user names)
            if (channelId && doc.metadata.channelId !== channelId)
                continue;
            if (channelName && doc.metadata.channelName.toLowerCase() !== channelName.toLowerCase())
                continue;
            if (userId && doc.metadata.userId !== userId)
                continue;
            // Calculate cosine similarity
            const score = (0, embeddings_js_1.cosineSimilarity)(queryEmbedding, doc.embedding);
            results.push({
                id: doc.id,
                text: doc.text,
                score,
                metadata: doc.metadata,
            });
        }
        // Sort by score descending and return top results
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }
    async get(ids) {
        const results = [];
        for (const id of ids) {
            const doc = this.documents.get(id);
            if (doc)
                results.push(doc);
        }
        return results;
    }
    async exists(id) {
        return this.documents.has(id);
    }
    async count() {
        return this.documents.size;
    }
    async clear() {
        this.documents.clear();
        this.persist();
    }
}
// Store instance
let store = null;
/**
 * Initialize the vector store connection.
 * Must be called before any other operations.
 */
async function initializeVectorStore() {
    if (store) {
        logger.debug('Vector store already initialized');
        return;
    }
    try {
        logger.info('Initializing vector store...');
        const persistPath = (0, path_1.join)(index_js_1.config.rag.vectorDbPath, 'vectors.json');
        store = new SimpleVectorStore(persistPath);
        await store.initialize();
        const count = await store.count();
        logger.info(`Vector store initialized. Collection has ${count} documents.`);
    }
    catch (error) {
        logger.error(`Failed to initialize vector store: ${error.message}`);
        throw new Error(`Vector store initialization failed: ${error.message}`);
    }
}
/**
 * Add documents to the vector store.
 */
async function addDocuments(documents) {
    if (!store) {
        await initializeVectorStore();
    }
    if (documents.length === 0) {
        logger.debug('No documents to add');
        return;
    }
    await store.add(documents);
    logger.info(`Added ${documents.length} documents to vector store`);
}
/**
 * Update existing documents in the vector store.
 */
async function updateDocuments(documents) {
    if (!store) {
        await initializeVectorStore();
    }
    if (documents.length === 0) {
        return;
    }
    await store.update(documents);
    logger.info(`Updated ${documents.length} documents`);
}
/**
 * Delete documents from the vector store.
 */
async function deleteDocuments(ids) {
    if (!store) {
        await initializeVectorStore();
    }
    if (ids.length === 0) {
        return;
    }
    await store.delete(ids);
    logger.info(`Deleted ${ids.length} documents`);
}
/**
 * Search for similar documents using a query embedding.
 */
async function search(queryEmbedding, options = {}) {
    if (!store) {
        await initializeVectorStore();
    }
    const results = await store.search(queryEmbedding, options);
    logger.debug(`Search returned ${results.length} results`);
    return results;
}
/**
 * Get the total number of documents in the store.
 */
async function getDocumentCount() {
    if (!store) {
        await initializeVectorStore();
    }
    return store.count();
}
/**
 * Check if a document exists in the store.
 */
async function documentExists(id) {
    if (!store) {
        await initializeVectorStore();
    }
    return store.exists(id);
}
/**
 * Get documents by their IDs.
 */
async function getDocuments(ids) {
    if (!store) {
        await initializeVectorStore();
    }
    if (ids.length === 0) {
        return [];
    }
    const docs = await store.get(ids);
    return docs.map(doc => ({
        id: doc.id,
        text: doc.text,
        score: 1.0,
        metadata: doc.metadata,
    }));
}
/**
 * Clear all documents from the store.
 */
async function clearAll() {
    if (!store) {
        await initializeVectorStore();
    }
    await store.clear();
    logger.warn('Cleared all documents from vector store');
}
//# sourceMappingURL=vectorstore.js.map