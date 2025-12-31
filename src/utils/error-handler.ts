/**
 * Error types and error handling utilities for Back-Agent MCP Server
 */

export enum ErrorCode {
  CLAUDE_NOT_FOUND = 'CLAUDE_NOT_FOUND',
  INVALID_WORKING_DIRECTORY = 'INVALID_WORKING_DIRECTORY',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class McpServerError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'McpServerError';
  }
}

export function isMcpServerError(error: unknown): error is McpServerError {
  return error instanceof McpServerError;
}

export function formatErrorMessage(error: unknown): string {
  if (isMcpServerError(error)) {
    let message = `[${error.code}] ${error.message}`;
    if (error.details) {
      message += `\nDetails: ${JSON.stringify(error.details)}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Create a standardized error response for MCP tool calls
 */
export function createErrorResponse(error: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const message = formatErrorMessage(error);
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}
