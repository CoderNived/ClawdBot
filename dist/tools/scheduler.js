"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskScheduler = void 0;
exports.parseRelativeTime = parseRelativeTime;
exports.toCronExpression = toCronExpression;
const node_cron_1 = __importDefault(require("node-cron"));
const web_api_1 = require("@slack/web-api");
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const database_js_1 = require("../memory/database.js");
const logger = (0, logger_js_1.createModuleLogger)('scheduler');
// Initialize Slack client
const webClient = new web_api_1.WebClient(index_js_1.config.slack.botToken);
// Store active cron jobs
const activeJobs = new Map();
class TaskScheduler {
    constructor() {
        this.checkInterval = null;
        this.isRunning = false;
        // Note: parseAndSchedule has been removed
        // Scheduling is now handled directly through the agent's tool calls
    }
    // Start the scheduler
    start() {
        if (this.isRunning) {
            logger.warn('Scheduler already running');
            return;
        }
        this.isRunning = true;
        logger.info('Starting task scheduler');
        // Check for pending tasks every minute
        this.checkInterval = setInterval(() => {
            this.processPendingTasks();
        }, 60000);
        // Run initial check
        this.processPendingTasks();
    }
    // Stop the scheduler
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        // Stop all cron jobs
        activeJobs.forEach((job, id) => {
            job.stop();
            logger.debug(`Stopped cron job: ${id}`);
        });
        activeJobs.clear();
        this.isRunning = false;
        logger.info('Task scheduler stopped');
    }
    // Schedule a new task
    async scheduleTask(userId, channelId, description, scheduledTime = null, cronExpression = null, threadTs = null) {
        logger.info(`Scheduling task for user ${userId}: ${description}`);
        // Create task in database
        const task = (0, database_js_1.createScheduledTask)(userId, channelId, description, scheduledTime ? Math.floor(scheduledTime.getTime() / 1000) : null, cronExpression, threadTs);
        // If it's a cron task, set up the job
        if (cronExpression && node_cron_1.default.validate(cronExpression)) {
            this.setupCronJob(task);
        }
        return task;
    }
    // Set up a cron job for recurring tasks
    setupCronJob(task) {
        if (!task.cronExpression)
            return;
        const jobId = `task-${task.id}`;
        if (activeJobs.has(jobId)) {
            logger.warn(`Cron job ${jobId} already exists`);
            return;
        }
        const job = node_cron_1.default.schedule(task.cronExpression, async () => {
            await this.executeTask(task);
        });
        activeJobs.set(jobId, job);
        logger.info(`Cron job scheduled: ${jobId} with expression ${task.cronExpression}`);
    }
    // Process pending one-time tasks
    async processPendingTasks() {
        const tasks = (0, database_js_1.getPendingTasks)();
        for (const task of tasks) {
            // Skip cron tasks (they're handled separately)
            if (task.cronExpression)
                continue;
            await this.executeTask(task);
        }
    }
    // Execute a task
    async executeTask(task) {
        logger.info(`Executing task ${task.id}: ${task.taskDescription}`);
        try {
            (0, database_js_1.updateTaskStatus)(task.id, 'running');
            // Send reminder message to Slack
            await webClient.chat.postMessage({
                channel: task.channelId,
                text: `⏰ *Reminder*: ${task.taskDescription}`,
                thread_ts: task.threadTs || undefined,
            });
            // Mark as completed (unless it's recurring)
            if (!task.cronExpression) {
                (0, database_js_1.updateTaskStatus)(task.id, 'completed');
            }
            else {
                // Reset to pending for next execution
                (0, database_js_1.updateTaskStatus)(task.id, 'pending');
            }
            logger.info(`Task ${task.id} executed successfully`);
        }
        catch (error) {
            logger.error(`Failed to execute task ${task.id}`, { error });
            (0, database_js_1.updateTaskStatus)(task.id, 'failed');
        }
    }
    // Get user's tasks
    getUserTasks(userId) {
        return (0, database_js_1.getUserTasks)(userId);
    }
    // Cancel a task
    cancelTask(taskId, userId) {
        const jobId = `task-${taskId}`;
        // Stop cron job if exists
        const job = activeJobs.get(jobId);
        if (job) {
            job.stop();
            activeJobs.delete(jobId);
        }
        return (0, database_js_1.cancelTask)(taskId, userId);
    }
}
// Export singleton instance
exports.taskScheduler = new TaskScheduler();
// Utility function to parse relative time expressions
function parseRelativeTime(expression) {
    const now = new Date();
    const expr = expression.toLowerCase().trim();
    // Match patterns like "in 5 minutes", "in 2 hours", "in 1 day"
    const relativeMatch = expr.match(/in\s+(\d+)\s+(minute|hour|day|week)s?/);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2];
        switch (unit) {
            case 'minute':
                return new Date(now.getTime() + amount * 60 * 1000);
            case 'hour':
                return new Date(now.getTime() + amount * 60 * 60 * 1000);
            case 'day':
                return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
            case 'week':
                return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
        }
    }
    // Match "tomorrow at HH:MM"
    const tomorrowMatch = expr.match(/tomorrow\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (tomorrowMatch) {
        let hours = parseInt(tomorrowMatch[1], 10);
        const minutes = parseInt(tomorrowMatch[2] || '0', 10);
        const period = tomorrowMatch[3]?.toLowerCase();
        if (period === 'pm' && hours < 12)
            hours += 12;
        if (period === 'am' && hours === 12)
            hours = 0;
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(hours, minutes, 0, 0);
        return tomorrow;
    }
    // Match "at HH:MM" (today or next occurrence)
    const atTimeMatch = expr.match(/at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (atTimeMatch) {
        let hours = parseInt(atTimeMatch[1], 10);
        const minutes = parseInt(atTimeMatch[2] || '0', 10);
        const period = atTimeMatch[3]?.toLowerCase();
        if (period === 'pm' && hours < 12)
            hours += 12;
        if (period === 'am' && hours === 12)
            hours = 0;
        const target = new Date(now);
        target.setHours(hours, minutes, 0, 0);
        // If time has passed today, schedule for tomorrow
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }
        return target;
    }
    return null;
}
// Convert common expressions to cron
function toCronExpression(expression) {
    const expr = expression.toLowerCase().trim();
    const patterns = {
        'every minute': '* * * * *',
        'every hour': '0 * * * *',
        'every day': '0 9 * * *',
        'every morning': '0 9 * * *',
        'every evening': '0 18 * * *',
        'every monday': '0 9 * * 1',
        'every tuesday': '0 9 * * 2',
        'every wednesday': '0 9 * * 3',
        'every thursday': '0 9 * * 4',
        'every friday': '0 9 * * 5',
        'every saturday': '0 9 * * 6',
        'every sunday': '0 9 * * 0',
        'every weekday': '0 9 * * 1-5',
        'every weekend': '0 9 * * 0,6',
        'every week': '0 9 * * 1',
    };
    for (const [pattern, cron] of Object.entries(patterns)) {
        if (expr.includes(pattern)) {
            return cron;
        }
    }
    return null;
}
//# sourceMappingURL=scheduler.js.map