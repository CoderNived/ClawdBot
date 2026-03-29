"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createModuleLogger = createModuleLogger;
const winston_1 = __importDefault(require("winston"));
const index_js_1 = require("../config/index.js");
const { combine, timestamp, printf, colorize, errors } = winston_1.default.format;
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) {
        log += `\n${stack}`;
    }
    if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
    }
    return log;
});
exports.logger = winston_1.default.createLogger({
    level: index_js_1.config.app.logLevel,
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    transports: [
        new winston_1.default.transports.Console({
            format: combine(colorize(), logFormat),
        }),
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston_1.default.transports.File({
            filename: 'logs/combined.log',
        }),
    ],
});
// Create a child logger for specific modules
function createModuleLogger(moduleName) {
    return exports.logger.child({ module: moduleName });
}
//# sourceMappingURL=logger.js.map