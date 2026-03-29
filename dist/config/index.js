"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuration schema with validation
const ConfigSchema = zod_1.z.object({
    // Slack Configuration
    slack: zod_1.z.object({
        botToken: zod_1.z.string().min(1, 'SLACK_BOT_TOKEN is required'),
        appToken: zod_1.z.string().min(1, 'SLACK_APP_TOKEN is required'),
        userToken: zod_1.z.string().optional(), // For reminders API (xoxp-...)
        signingSecret: zod_1.z.string().optional(),
    }),
    // AI Model Configuration
    ai: zod_1.z.object({
        anthropicApiKey: zod_1.z.string().optional(),
        openaiApiKey: zod_1.z.string().optional(),
        defaultModel: zod_1.z.string().default('claude-sonnet-4-20250514'),
    }),
    // RAG Configuration
    rag: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        embeddingModel: zod_1.z.string().default('text-embedding-3-small'),
        vectorDbPath: zod_1.z.string().default('./data/chroma'),
        indexIntervalHours: zod_1.z.number().default(1),
        maxResults: zod_1.z.number().default(10),
        minSimilarity: zod_1.z.number().default(0.5),
    }),
    // Memory Configuration (mem0)
    memory: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        extractionModel: zod_1.z.string().default('gpt-4o-mini'),
    }),
    // Application Settings
    app: zod_1.z.object({
        logLevel: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        databasePath: zod_1.z.string().default('./data/assistant.db'),
        maxHistoryMessages: zod_1.z.number().default(50),
        sessionTimeoutMinutes: zod_1.z.number().default(60),
    }),
    // Security Settings
    security: zod_1.z.object({
        dmPolicy: zod_1.z.enum(['open', 'pairing', 'allowlist']).default('pairing'),
        allowedUsers: zod_1.z.array(zod_1.z.string()).default(['*']),
        allowedChannels: zod_1.z.array(zod_1.z.string()).default(['*']),
    }),
    // Feature Flags
    features: zod_1.z.object({
        threadSummary: zod_1.z.boolean().default(true),
        taskScheduler: zod_1.z.boolean().default(true),
        reactions: zod_1.z.boolean().default(true),
        typingIndicator: zod_1.z.boolean().default(true),
    }),
});
function parseArrayFromEnv(value) {
    if (!value)
        return ['*'];
    return value.split(',').map((s) => s.trim());
}
function loadConfig() {
    const rawConfig = {
        slack: {
            botToken: process.env.SLACK_BOT_TOKEN || '',
            appToken: process.env.SLACK_APP_TOKEN || '',
            userToken: process.env.SLACK_USER_TOKEN, // For reminders API
            signingSecret: process.env.SLACK_SIGNING_SECRET,
        },
        ai: {
            anthropicApiKey: process.env.ANTHROPIC_API_KEY,
            openaiApiKey: process.env.OPENAI_API_KEY,
            defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514',
        },
        rag: {
            enabled: process.env.RAG_ENABLED !== 'false',
            embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
            vectorDbPath: process.env.RAG_VECTOR_DB_PATH || './data/chroma',
            indexIntervalHours: parseInt(process.env.RAG_INDEX_INTERVAL_HOURS || '1', 10),
            maxResults: parseInt(process.env.RAG_MAX_RESULTS || '10', 10),
            minSimilarity: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.5'),
        },
        memory: {
            enabled: process.env.MEMORY_ENABLED !== 'false',
            extractionModel: process.env.MEMORY_EXTRACTION_MODEL || 'gpt-4o-mini',
        },
        app: {
            logLevel: process.env.LOG_LEVEL || 'info',
            databasePath: process.env.DATABASE_PATH || './data/assistant.db',
            maxHistoryMessages: parseInt(process.env.MAX_HISTORY_MESSAGES || '50', 10),
            sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '60', 10),
        },
        security: {
            dmPolicy: process.env.DM_POLICY || 'pairing',
            allowedUsers: parseArrayFromEnv(process.env.ALLOWED_USERS),
            allowedChannels: parseArrayFromEnv(process.env.ALLOWED_CHANNELS),
        },
        features: {
            threadSummary: process.env.ENABLE_THREAD_SUMMARY !== 'false',
            taskScheduler: process.env.ENABLE_TASK_SCHEDULER !== 'false',
            reactions: process.env.ENABLE_REACTIONS !== 'false',
            typingIndicator: process.env.ENABLE_TYPING_INDICATOR !== 'false',
        },
    };
    const result = ConfigSchema.safeParse(rawConfig);
    if (!result.success) {
        console.error('Configuration validation failed:');
        result.error.errors.forEach((err) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
        });
        process.exit(1);
    }
    // Validate that at least one AI provider is configured
    if (!result.data.ai.anthropicApiKey && !result.data.ai.openaiApiKey) {
        console.error('At least one AI provider (Anthropic or OpenAI) must be configured');
        process.exit(1);
    }
    return result.data;
}
exports.config = loadConfig();
//# sourceMappingURL=index.js.map