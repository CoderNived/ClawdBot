"use strict";
/**
 * Debug script to test RAG search
 * Run with: npx tsx scripts/test-rag.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const vectorstore_js_1 = require("../src/rag/vectorstore.js");
const embeddings_js_1 = require("../src/rag/embeddings.js");
async function main() {
    console.log('Initializing vector store...');
    await (0, vectorstore_js_1.initializeVectorStore)();
    const count = await (0, vectorstore_js_1.getDocumentCount)();
    console.log(`Total documents: ${count}`);
    if (count === 0) {
        console.log('No documents indexed!');
        return;
    }
    // Test search without channel filter
    console.log('\n--- Test 1: Search "SOP LOR" without channel filter ---');
    const embedding1 = await (0, embeddings_js_1.createEmbedding)('SOP LOR');
    const results1 = await (0, vectorstore_js_1.search)(embedding1, { limit: 5 });
    console.log(`Found ${results1.length} results:`);
    results1.forEach((r, i) => {
        console.log(`${i + 1}. [${r.metadata.channelName}] ${r.text.substring(0, 100)}... (score: ${r.score.toFixed(3)})`);
    });
    // Test search with channel filter
    console.log('\n--- Test 2: Search "SOP LOR" in saurav-ltm ---');
    const results2 = await (0, vectorstore_js_1.search)(embedding1, { limit: 5, channelName: 'saurav-ltm' });
    console.log(`Found ${results2.length} results:`);
    results2.forEach((r, i) => {
        console.log(`${i + 1}. [${r.metadata.channelName}] ${r.text.substring(0, 100)}... (score: ${r.score.toFixed(3)})`);
    });
    // Test generic search
    console.log('\n--- Test 3: Generic search for ANY content ---');
    const embedding3 = await (0, embeddings_js_1.createEmbedding)('discussion conversation');
    const results3 = await (0, vectorstore_js_1.search)(embedding3, { limit: 5 });
    console.log(`Found ${results3.length} results:`);
    results3.forEach((r, i) => {
        console.log(`${i + 1}. [${r.metadata.channelName}] ${r.text.substring(0, 100)}... (score: ${r.score.toFixed(3)})`);
    });
    // List unique channels in the store
    console.log('\n--- Test 4: Sample documents from vector store ---');
    const allResults = await (0, vectorstore_js_1.search)(await (0, embeddings_js_1.createEmbedding)('hello'), { limit: 20 });
    const channels = new Set(allResults.map(r => r.metadata.channelName));
    console.log('Channels in vector store:', [...channels].join(', '));
}
main().catch(console.error);
//# sourceMappingURL=test-rag.js.map