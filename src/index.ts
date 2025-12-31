/**
 * Back-Agent MCP Server
 *
 * An MCP server that executes tasks using Claude Code CLI.
 *
 * Main entry point for the server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerExecuteTaskTool } from './server/tools/execute-task.js';
import { logger, setLogLevel, LogLevel } from './utils/logger.js';

const SERVER_INFO = {
  name: 'back-agent-mcp',
  version: '1.0.0',
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

  // Create MCP server instance
  const server = new McpServer(SERVER_INFO);

  // Register tools
  registerExecuteTaskTool(server);
  logger.info('Registered tool: execute-task');

  // Create stdio transport for communication
  const transport = new StdioServerTransport();

  // Connect the server to the transport
  await server.connect(transport);

  // IMPORTANT: Log to stderr, not stdout (stdio is used for MCP communication)
  logger.info('Back-Agent MCP Server is running');
  logger.info('Waiting for tool calls...');
}

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
