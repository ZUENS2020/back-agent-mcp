/**
 * Logger utility for Back-Agent MCP Server
 *
 * IMPORTANT: All logs must go to stderr to avoid interfering with
 * the MCP stdio communication (which uses stdout for JSON-RPC messages).
 *
 * Logs are written to both stderr and optionally to a file.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel: LogLevel = LogLevel.INFO;
let logFilePath: string | null = null;

/**
 * Initialize file logging
 * @param filePath Path to the log file. If relative, resolves from current working directory
 */
export function initLogFile(filePath?: string): void {
  const path = filePath || process.env.LOG_FILE;
  if (!path) {
    return;
  }

  // Resolve relative paths from current working directory
  logFilePath = resolve(process.cwd(), path);

  // Create directory if it doesn't exist
  const logDir = dirname(logFilePath);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Write startup marker
  const separator = '='.repeat(60);
  const startMsg = `${separator}\n[Back-Agent MCP] Logging started at ${new Date().toISOString()}\n${separator}\n`;
  appendFileSync(logFilePath, startMsg);
}

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
 * Write log message to file
 */
function writeToFile(message: string): void {
  if (!logFilePath) {
    return;
  }
  try {
    appendFileSync(logFilePath, message + '\n');
  } catch (error) {
    // Silently fail to avoid infinite loop if logging fails
    // The error will still be visible in stderr
  }
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

  // Also write to file if enabled
  writeToFile(output);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log(LogLevel.DEBUG, message, ...args),
  info: (message: string, ...args: unknown[]) => log(LogLevel.INFO, message, ...args),
  warn: (message: string, ...args: unknown[]) => log(LogLevel.WARN, message, ...args),
  error: (message: string, ...args: unknown[]) => log(LogLevel.ERROR, message, ...args),
};
