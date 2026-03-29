"use strict";
/**
 * Manual Indexer Script
 *
 * Run this script to manually trigger indexing of Slack messages.
 * Useful for:
 * - Initial indexing of historical messages
 * - Re-indexing after clearing the vector store
 * - Testing the indexer
 *
 * Usage:
 *   npx tsx scripts/run-indexer.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const index_js_1 = require("../src/rag/index.js");
const logger_js_1 = require("../src/utils/logger.js");
const logger = (0, logger_js_1.createModuleLogger)('manual-indexer');
async function main() {
    logger.info('Starting manual indexing...');
    try {
        // Initialize vector store
        await (0, index_js_1.initializeVectorStore)();
        const beforeCount = await (0, index_js_1.getDocumentCount)();
        logger.info(`Documents before indexing: ${beforeCount}`);
        // Run indexer
        const result = await (0, index_js_1.runIndex)();
        // Get final count
        const afterCount = await (0, index_js_1.getDocumentCount)();
        logger.info('='.repeat(50));
        logger.info('Indexing Complete!');
        logger.info(`  • Documents indexed: ${result.indexed}`);
        logger.info(`  • Errors: ${result.errors}`);
        logger.info(`  • Total documents: ${afterCount}`);
        logger.info('='.repeat(50));
    }
    catch (error) {
        logger.error(`Indexing failed: ${error.message}`);
        process.exit(1);
    }
    process.exit(0);
}
main();
//# sourceMappingURL=run-indexer.js.map