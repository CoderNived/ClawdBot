"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeDatabase = initializeDatabase;
exports.getOrCreateSession = getOrCreateSession;
exports.getSession = getSession;
exports.addMessage = addMessage;
exports.getSessionHistory = getSessionHistory;
exports.getThreadMessages = getThreadMessages;
exports.clearSessionHistory = clearSessionHistory;
exports.createScheduledTask = createScheduledTask;
exports.getPendingTasks = getPendingTasks;
exports.updateTaskStatus = updateTaskStatus;
exports.getUserTasks = getUserTasks;
exports.cancelTask = cancelTask;
exports.generatePairingCode = generatePairingCode;
exports.verifyPairingCode = verifyPairingCode;
exports.approvePairing = approvePairing;
exports.isUserApproved = isUserApproved;
exports.cleanupOldSessions = cleanupOldSessions;
exports.cleanupExpiredPairingCodes = cleanupExpiredPairingCodes;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const fs_1 = require("fs");
const path_1 = require("path");
const logger = (0, logger_js_1.createModuleLogger)('database');
// Ensure data directory exists
const dbDir = (0, path_1.dirname)(index_js_1.config.app.databasePath);
if (!(0, fs_1.existsSync)(dbDir)) {
    (0, fs_1.mkdirSync)(dbDir, { recursive: true });
}
// Initialize database
const db = new better_sqlite3_1.default(index_js_1.config.app.databasePath);
exports.db = db;
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Initialize schema
function initSchema() {
    logger.info('Initializing database schema...');
    // Sessions table - tracks conversation sessions
    db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      thread_ts TEXT,
      session_type TEXT NOT NULL DEFAULT 'dm',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_activity INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT
    )
  `);
    // Messages table - stores conversation history
    db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      slack_ts TEXT,
      thread_ts TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
    // Scheduled tasks table
    db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_ts TEXT,
      task_description TEXT NOT NULL,
      cron_expression TEXT,
      scheduled_time INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      executed_at INTEGER,
      metadata TEXT
    )
  `);
    // Pairing codes for DM security
    db.exec(`
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0
    )
  `);
    // Approved users for DM access
    db.exec(`
    CREATE TABLE IF NOT EXISTS approved_users (
      user_id TEXT PRIMARY KEY,
      approved_at INTEGER NOT NULL DEFAULT (unixepoch()),
      approved_by TEXT
    )
  `);
    // Create indexes for performance
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_user ON pairing_codes(user_id);
  `);
    logger.info('Database schema initialized');
}
initSchema();
/**
 * Initialize the database.
 * Called at startup to ensure schema is ready.
 * Safe to call multiple times.
 */
function initializeDatabase() {
    // Schema is initialized automatically when this module is imported.
    // This function exists for explicit initialization in the main entry point.
    logger.info('Database ready');
}
function getOrCreateSession(userId, channelId, threadTs) {
    // Generate session ID based on context
    let sessionId;
    let sessionType;
    if (threadTs) {
        sessionId = `thread:${channelId}:${threadTs}`;
        sessionType = 'thread';
    }
    else if (channelId && !channelId.startsWith('D')) {
        sessionId = `channel:${channelId}`;
        sessionType = 'channel';
    }
    else {
        sessionId = `dm:${userId}`;
        sessionType = 'dm';
    }
    // Check if session exists
    const existing = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId);
    if (existing) {
        // Update last activity
        db.prepare(`
      UPDATE sessions SET last_activity = unixepoch() WHERE id = ?
    `).run(sessionId);
        return {
            ...existing,
            metadata: existing.metadata ? JSON.parse(existing.metadata) : null,
        };
    }
    // Create new session
    db.prepare(`
    INSERT INTO sessions (id, user_id, channel_id, thread_ts, session_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, channelId, threadTs, sessionType);
    return {
        id: sessionId,
        userId,
        channelId,
        threadTs,
        sessionType,
        createdAt: Math.floor(Date.now() / 1000),
        lastActivity: Math.floor(Date.now() / 1000),
        metadata: null,
    };
}
function getSession(sessionId) {
    const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId);
    if (!session)
        return null;
    return {
        ...session,
        metadata: session.metadata ? JSON.parse(session.metadata) : null,
    };
}
function addMessage(sessionId, role, content, slackTs, threadTs, metadata) {
    const result = db.prepare(`
    INSERT INTO messages (session_id, role, content, slack_ts, thread_ts, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, role, content, slackTs || null, threadTs || null, metadata ? JSON.stringify(metadata) : null);
    return {
        id: Number(result.lastInsertRowid),
        sessionId,
        role,
        content,
        slackTs: slackTs || null,
        threadTs: threadTs || null,
        createdAt: Math.floor(Date.now() / 1000),
        metadata: metadata || null,
    };
}
function getSessionHistory(sessionId, limit = index_js_1.config.app.maxHistoryMessages) {
    const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, limit);
    return messages.reverse().map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
    }));
}
function getThreadMessages(channelId, threadTs) {
    const sessionId = `thread:${channelId}:${threadTs}`;
    return getSessionHistory(sessionId, 100);
}
function clearSessionHistory(sessionId) {
    db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
    logger.info(`Cleared history for session: ${sessionId}`);
}
function createScheduledTask(userId, channelId, taskDescription, scheduledTime = null, cronExpression = null, threadTs = null) {
    const result = db.prepare(`
    INSERT INTO scheduled_tasks 
    (user_id, channel_id, thread_ts, task_description, cron_expression, scheduled_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, channelId, threadTs, taskDescription, cronExpression, scheduledTime);
    return {
        id: Number(result.lastInsertRowid),
        userId,
        channelId,
        threadTs,
        taskDescription,
        cronExpression,
        scheduledTime,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        executedAt: null,
        metadata: null,
    };
}
function getPendingTasks() {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'pending'
    AND (scheduled_time IS NULL OR scheduled_time <= ?)
    ORDER BY scheduled_time ASC
  `).all(now);
}
function updateTaskStatus(taskId, status) {
    db.prepare(`
    UPDATE scheduled_tasks
    SET status = ?, executed_at = CASE WHEN ? IN ('completed', 'failed') THEN unixepoch() ELSE executed_at END
    WHERE id = ?
  `).run(status, status, taskId);
}
function getUserTasks(userId) {
    return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId);
}
function cancelTask(taskId, userId) {
    const result = db.prepare(`
    UPDATE scheduled_tasks
    SET status = 'cancelled'
    WHERE id = ? AND user_id = ? AND status = 'pending'
  `).run(taskId, userId);
    return result.changes > 0;
}
// ============================================
// DM Pairing Security
// ============================================
function generatePairingCode(userId) {
    // Generate 6-character alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    // Delete any existing codes for this user
    db.prepare(`DELETE FROM pairing_codes WHERE user_id = ?`).run(userId);
    // Create new code
    db.prepare(`
    INSERT INTO pairing_codes (code, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(code, userId, expiresAt);
    return code;
}
function verifyPairingCode(code) {
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
    SELECT user_id FROM pairing_codes
    WHERE code = ? AND expires_at > ? AND approved = 0
  `).get(code.toUpperCase());
    return result?.user_id || null;
}
function approvePairing(code, approvedBy) {
    const userId = verifyPairingCode(code);
    if (!userId)
        return false;
    db.prepare(`
    UPDATE pairing_codes SET approved = 1 WHERE code = ?
  `).run(code.toUpperCase());
    db.prepare(`
    INSERT OR REPLACE INTO approved_users (user_id, approved_by)
    VALUES (?, ?)
  `).run(userId, approvedBy);
    return true;
}
function isUserApproved(userId) {
    // Check if user is in allowed list or approved users
    if (index_js_1.config.security.allowedUsers.includes('*'))
        return true;
    if (index_js_1.config.security.allowedUsers.includes(userId))
        return true;
    const result = db.prepare(`
    SELECT 1 FROM approved_users WHERE user_id = ?
  `).get(userId);
    return !!result;
}
// ============================================
// Cleanup and Maintenance
// ============================================
function cleanupOldSessions(maxAgeSeconds = 86400 * 7) {
    const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
    const result = db.prepare(`
    DELETE FROM sessions WHERE last_activity < ?
  `).run(cutoff);
    logger.info(`Cleaned up ${result.changes} old sessions`);
    return result.changes;
}
function cleanupExpiredPairingCodes() {
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
    DELETE FROM pairing_codes WHERE expires_at < ? AND approved = 0
  `).run(now);
    return result.changes;
}
/**
 * Close the database connection.
 * Should be called during graceful shutdown.
 */
function closeDatabase() {
    if (db) {
        db.close();
    }
}
//# sourceMappingURL=database.js.map