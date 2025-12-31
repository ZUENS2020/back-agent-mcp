/**
 * Logger utility for Back-Agent MCP Server
 *
 * IMPORTANT: All logs must go to stderr to avoid interfering with
 * the MCP stdio communication (which uses stdout for JSON-RPC messages).
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel: LogLevel = LogLevel.INFO;

/**
 * Set the current log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Format timestamp for log messages
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Write log message to stderr
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (level < currentLogLevel) {
    return;
  }

  const levelName = LogLevel[level];
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${levelName}]`;

  const output = args.length > 0
    ? `${prefix} ${message} ${args.map(String).join(' ')}`
    : `${prefix} ${message}`;

  // Always write to stderr to avoid interfering with MCP stdio communication
  console.error(output);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log(LogLevel.DEBUG, message, ...args),
  info: (message: string, ...args: unknown[]) => log(LogLevel.INFO, message, ...args),
  warn: (message: string, ...args: unknown[]) => log(LogLevel.WARN, message, ...args),
  error: (message: string, ...args: unknown[]) => log(LogLevel.ERROR, message, ...args),
};
