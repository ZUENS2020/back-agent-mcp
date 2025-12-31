#!/usr/bin/env node
/** Back-Agent MCP Server
 *
 * An MCP server that executes tasks using Claude Code CLI.
 *
 * Main entry point for the server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerExecuteTaskTool } from './server/tools/execute-task.js';
import { registerTaskManagementTools } from './task-manager/task-tools.js';
import { logger, setLogLevel, LogLevel } from './utils/logger.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const SERVER_INFO = {
  name: 'back-agent-mcp',
  version: packageJson.version,
};

/**
 * Start the MCP server
 */
async function main(): Promise<void> {
  // Set log level from environment variable if provided
  const logLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (logLevel === 'DEBUG') {
    setLogLevel(LogLevel.DEBUG);
  } else if (logLevel === 'WARN') {
    setLogLevel(LogLevel.WARN);
  } else if (logLevel === 'ERROR') {
    setLogLevel(LogLevel.ERROR);
  }

  logger.info(`Starting ${SERVER_INFO.name} v${SERVER_INFO.version}`);

  try {
    // Create MCP server instance
    logger.debug('Creating McpServer instance...');
    const server = new McpServer(SERVER_INFO);

    // Register tools
    logger.debug('Registering tools...');
    registerExecuteTaskTool(server);
    logger.info('Registered tool: execute-task');

    registerTaskManagementTools(server);
    logger.info('Registered task management tools');

    // Create stdio transport for communication
    logger.debug('Creating StdioServerTransport...');
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    logger.debug('Connecting server to transport...');
    await server.connect(transport);

    // IMPORTANT: Log to stderr, not stdout (stdio is used for MCP communication)
    logger.info('Back-Agent MCP Server is running');
    logger.info('Waiting for tool calls...');
  } catch (error) {
    logger.error(`Error during startup: ${error}`);
    if (error instanceof Error) {
      logger.error(`Error stack: ${error.stack}`);
    }
    throw error;
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  logger.error(`Stack: ${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error(`Unhandled rejection: ${reason}`);
  if (reason instanceof Error) {
    logger.error(`Stack: ${reason.stack}`);
  }
  process.exit(1);
});

// Start the server
main().catch((error) => {
  logger.error(`Fatal error starting server: ${error}`);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  process.exit(0);
});
