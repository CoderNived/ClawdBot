"use strict";
/**
 * Indexer Module
 *
 * This module handles the background indexing of Slack messages into the
 * vector database. It periodically fetches new messages, creates embeddings,
 * and stores them for semantic search.
 *
 * WHY BACKGROUND INDEXING?
 * ------------------------
 * - Real-time indexing would slow down message processing
 * - Batch processing is more efficient for embeddings
 * - Allows graceful handling of rate limits
 * - Can run during off-peak hours
 *
 * INDEXING STRATEGY:
 * ------------------
 * 1. Track last indexed timestamp per channel
 * 2. Fetch only new messages since last index
 * 3. Process in batches for efficiency
 * 4. Handle errors gracefully (retry logic)
 * 5. Skip already indexed messages (deduplication)
 *
 * WHAT GETS INDEXED:
 * ------------------
 * - Regular messages (not system messages)
 * - Thread replies
 * - Messages with meaningful content (> 10 chars)
 *
 * WHAT'S EXCLUDED:
 * ----------------
 * - Bot messages (optional, configurable)
 * - Empty messages or just emojis
 * - System messages (joins, leaves, etc.)
 * - Messages from archived channels
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIndexer = startIndexer;
exports.stopIndexer = stopIndexer;
exports.runIndex = runIndex;
exports.indexChannelManually = indexChannelManually;
exports.indexSingleMessage = indexSingleMessage;
exports.getIndexerStatus = getIndexerStatus;
const web_api_1 = require("@slack/web-api");
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const embeddings_js_1 = require("./embeddings.js");
const vectorstore_js_1 = require("./vectorstore.js");
const slack_actions_js_1 = require("../tools/slack-actions.js");
const logger = (0, logger_js_1.createModuleLogger)('indexer');
// Slack client
const slackClient = new web_api_1.WebClient(index_js_1.config.slack.botToken);
// Indexing configuration
const BATCH_SIZE = 50; // Messages per batch
const INDEX_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MESSAGES_PER_CHANNEL = 200; // Max messages to fetch per channel per run
// Store last indexed timestamp per channel
// In production, persist this to database
const lastIndexedTimestamps = new Map();
// Track if indexer is running
let isRunning = false;
let indexInterval = null;
/**
 * Start the background indexer.
 * Runs immediately, then on schedule.
 *
 * @example
 * startIndexer();
 * // Indexer now runs every hour
 */
function startIndexer() {
    if (isRunning) {
        logger.warn('Indexer already running');
        return;
    }
    isRunning = true;
    logger.info('Starting RAG indexer');
    // Run initial index
    runIndex().catch(err => {
        logger.error('Initial index failed', { error: err });
    });
    // Schedule periodic indexing
    indexInterval = setInterval(() => {
        runIndex().catch(err => {
            logger.error('Scheduled index failed', { error: err });
        });
    }, INDEX_INTERVAL_MS);
    logger.info(`Indexer scheduled to run every ${INDEX_INTERVAL_MS / 1000 / 60} minutes`);
}
/**
 * Stop the background indexer.
 */
function stopIndexer() {
    if (indexInterval) {
        clearInterval(indexInterval);
        indexInterval = null;
    }
    isRunning = false;
    logger.info('Indexer stopped');
}
/**
 * Run a single indexing pass.
 * Fetches new messages from all accessible channels and indexes them.
 */
async function runIndex() {
    logger.info('Starting indexing run...');
    const startTime = Date.now();
    let totalIndexed = 0;
    let totalErrors = 0;
    try {
        // Initialize vector store if not already
        await (0, vectorstore_js_1.initializeVectorStore)();
        // Get all channels the bot can access
        const channels = await (0, slack_actions_js_1.listChannels)();
        const memberChannels = channels.filter(c => c.isMember);
        logger.info(`Found ${memberChannels.length} channels to index`);
        // Index each channel
        for (const channel of memberChannels) {
            try {
                const result = await indexChannel(channel.id, channel.name);
                totalIndexed += result.indexed;
                totalErrors += result.errors;
            }
            catch (error) {
                logger.error(`Failed to index channel ${channel.name}: ${error.message}`);
                totalErrors++;
            }
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const docCount = await (0, vectorstore_js_1.getDocumentCount)();
        logger.info(`Indexing complete in ${duration}s. Indexed: ${totalIndexed}, Errors: ${totalErrors}, Total docs: ${docCount}`);
        return { indexed: totalIndexed, errors: totalErrors };
    }
    catch (error) {
        logger.error(`Indexing run failed: ${error.message}`);
        throw error;
    }
}
/**
 * Index messages from a specific channel.
 *
 * @param channelId - Slack channel ID
 * @param channelName - Channel name for metadata
 */
async function indexChannel(channelId, channelName) {
    logger.debug(`Indexing channel: ${channelName} (${channelId})`);
    let indexed = 0;
    let errors = 0;
    try {
        // Get messages since last indexed
        const oldest = lastIndexedTimestamps.get(channelId);
        const result = await slackClient.conversations.history({
            channel: channelId,
            limit: MESSAGES_PER_CHANNEL,
            oldest: oldest,
        });
        const messages = (result.messages || []);
        if (messages.length === 0) {
            logger.debug(`No new messages in ${channelName}`);
            return { indexed: 0, errors: 0 };
        }
        logger.debug(`Found ${messages.length} messages in ${channelName}`);
        // Filter and prepare messages for indexing
        const documentsToIndex = [];
        for (const message of messages) {
            // Skip system messages
            if (message.subtype) {
                continue;
            }
            // Skip bot messages (optional)
            if (message.bot_id) {
                continue;
            }
            // Skip if no text
            if (!message.text) {
                continue;
            }
            // Preprocess text
            const processedText = (0, embeddings_js_1.preprocessText)(message.text);
            // Skip if too short after preprocessing
            if (processedText.length < 10) {
                continue;
            }
            // Check if already indexed
            const docId = `${channelId}:${message.ts}`;
            if (await (0, vectorstore_js_1.documentExists)(docId)) {
                continue;
            }
            documentsToIndex.push({ message, processedText });
        }
        if (documentsToIndex.length === 0) {
            logger.debug(`No new messages to index in ${channelName}`);
            // Update last indexed timestamp
            if (messages.length > 0) {
                lastIndexedTimestamps.set(channelId, messages[0].ts);
            }
            return { indexed: 0, errors: 0 };
        }
        // Create embeddings in batches
        for (let i = 0; i < documentsToIndex.length; i += BATCH_SIZE) {
            const batch = documentsToIndex.slice(i, i + BATCH_SIZE);
            try {
                // Get embeddings for batch
                const texts = batch.map(d => d.processedText);
                const embeddings = await (0, embeddings_js_1.createEmbeddings)(texts);
                // Create documents
                const documents = [];
                for (let j = 0; j < batch.length; j++) {
                    const { message, processedText } = batch[j];
                    const embedding = embeddings[j];
                    // Get user info
                    let userName = 'unknown';
                    if (message.user) {
                        const userInfo = await (0, slack_actions_js_1.getUserInfo)(message.user);
                        userName = userInfo?.realName || userInfo?.name || 'unknown';
                    }
                    const docId = `${channelId}:${message.ts}`;
                    const metadata = {
                        channelId,
                        channelName,
                        userId: message.user || 'unknown',
                        userName,
                        timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
                        messageTs: message.ts,
                        threadTs: message.thread_ts,
                        isThread: !!message.thread_ts && message.thread_ts !== message.ts,
                        indexedAt: new Date().toISOString(),
                    };
                    documents.push({
                        id: docId,
                        text: processedText,
                        embedding,
                        metadata,
                    });
                }
                // Store in vector database
                await (0, vectorstore_js_1.addDocuments)(documents);
                indexed += documents.length;
                logger.debug(`Indexed batch of ${documents.length} messages from ${channelName}`);
            }
            catch (error) {
                logger.error(`Failed to index batch from ${channelName}: ${error.message}`);
                errors++;
            }
        }
        // Update last indexed timestamp
        if (messages.length > 0) {
            lastIndexedTimestamps.set(channelId, messages[0].ts);
        }
        logger.info(`Indexed ${indexed} messages from ${channelName}`);
        return { indexed, errors };
    }
    catch (error) {
        logger.error(`Error indexing channel ${channelName}: ${error.message}`);
        return { indexed: 0, errors: 1 };
    }
}
/**
 * Manually trigger indexing of a specific channel.
 * Useful for on-demand indexing.
 *
 * @param channelId - Channel to index
 * @param channelName - Channel name
 */
async function indexChannelManually(channelId, channelName) {
    await (0, vectorstore_js_1.initializeVectorStore)();
    return indexChannel(channelId, channelName);
}
/**
 * Index a single message immediately.
 * Useful for real-time indexing of important messages.
 *
 * @param message - Message to index
 * @param channelId - Channel ID
 * @param channelName - Channel name
 */
async function indexSingleMessage(message, channelId, channelName) {
    try {
        await (0, vectorstore_js_1.initializeVectorStore)();
        const processedText = (0, embeddings_js_1.preprocessText)(message.text);
        if (processedText.length < 10) {
            return false;
        }
        const docId = `${channelId}:${message.ts}`;
        if (await (0, vectorstore_js_1.documentExists)(docId)) {
            return false;
        }
        const embedding = await (0, embeddings_js_1.createEmbedding)(processedText);
        let userName = 'unknown';
        if (message.user) {
            const userInfo = await (0, slack_actions_js_1.getUserInfo)(message.user);
            userName = userInfo?.realName || userInfo?.name || 'unknown';
        }
        const metadata = {
            channelId,
            channelName,
            userId: message.user || 'unknown',
            userName,
            timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
            messageTs: message.ts,
            threadTs: message.thread_ts,
            isThread: !!message.thread_ts && message.thread_ts !== message.ts,
            indexedAt: new Date().toISOString(),
        };
        await (0, vectorstore_js_1.addDocuments)([{
                id: docId,
                text: processedText,
                embedding,
                metadata,
            }]);
        logger.debug(`Indexed single message: ${docId}`);
        return true;
    }
    catch (error) {
        logger.error(`Failed to index single message: ${error.message}`);
        return false;
    }
}
/**
 * Get indexer status.
 */
function getIndexerStatus() {
    return {
        isRunning,
        channelsIndexed: lastIndexedTimestamps.size,
        lastIndexedTimestamps: Object.fromEntries(lastIndexedTimestamps),
    };
}
//# sourceMappingURL=indexer.js.map