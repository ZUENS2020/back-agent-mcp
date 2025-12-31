/**
 * Execute Task Tool for MCP Server
 *
 * This tool allows clients to execute development tasks using Claude Code CLI.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { executeClaudeTask } from '../../claude/executor.js';
import { logger } from '../../utils/logger.js';
import { createErrorResponse } from '../../utils/error-handler.js';

/**
 * Input schema for the execute-task tool
 */
export const executeTaskInputSchema = z.object({
  task: z.string().describe(
    'Natural language task description for Claude Code AI. ' +
    'This is NOT a direct shell command executor. Claude Code is an AI programming assistant ' +
    'that will interpret your request and use its own tools (Read, Edit, Bash, etc.) to complete the task. ' +
    'Example: "Create a README file" or "Fix the bug in login.js" or "Run the tests and report results"'
  ),
  workingDirectory: z.string().optional().describe(
    'The working directory for Claude Code execution. ' +
    'Defaults to the current workspace directory if not specified.'
  ),
  timeout: z.number().min(1).max(3600).optional().describe('Timeout in seconds (max 3600)'),
  additionalArgs: z.array(z.string()).optional().describe('Additional CLI arguments for Claude Code'),
});

export type ExecuteTaskInput = z.infer<typeof executeTaskInputSchema>;

/**
 * Register the execute-task tool with the MCP server
 */
export function registerExecuteTaskTool(server: McpServer): void {
  server.registerTool(
    'execute-task',
    {
      description: '**IMPORTANT: This is an AI programming assistant tool, NOT a direct shell command executor.**\n\n' +
        'This tool spawns Claude Code (an AI coding agent) as a subprocess to complete development tasks. ' +
        'Claude Code will interpret your natural language request and autonomously decide which actions to take ' +
        '(reading files, editing code, running commands, etc.) to accomplish the goal.\n\n' +
        '**What it does:**\n' +
        '- Accepts natural language task descriptions\n' +
        '- Claude Code AI figures out how to complete the task\n' +
        '- Returns the AI\'s response and actions taken\n\n' +
        '**What it does NOT do:**\n' +
        '- NOT a direct shell/bash command executor\n' +
        '- Does NOT return raw stdout/stderr from commands\n' +
        '- For direct command execution, use the Bash tool instead\n\n' +
        '**Example usage:**\n' +
        '- "Create a REST API endpoint for user authentication"\n' +
        '- "Debug why the tests are failing"\n' +
        '- "Refactor the user module to use TypeScript"\n\n' +
        'The returned output is Claude Code\'s conversational response, not raw command output.',
      inputSchema: executeTaskInputSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      // Validate input
      const validationResult = executeTaskInputSchema.safeParse(input);

      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        logger.error(`Invalid input: ${errorMessages}`);
        return createErrorResponse(
          new Error(`Invalid input: ${errorMessages}`)
        );
      }

      const { task, workingDirectory, timeout = 300, additionalArgs = [] } = validationResult.data;

      logger.info(`Executing task via MCP: "${task.substring(0, 50)}..."`);

      try {
        // Execute the task
        const result = await executeClaudeTask({
          task,
          workingDirectory,
          timeout: timeout * 1000, // Convert to milliseconds
          additionalArgs,
        });

        // Format and return the result
        if (result.success) {
          const output = result.stdout.trim()
            ? result.stdout
            : 'Task completed successfully with no output.';

          logger.info('Task completed successfully');
          return {
            content: [
              {
                type: 'text' as const,
                text: formatSuccessOutput(output, result.exitCode),
              },
            ],
          };
        } else {
          logger.error('Task execution failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: formatErrorOutput(result, task),
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        logger.error(`Unexpected error: ${error}`);
        return createErrorResponse(error);
      }
    }
  );
}

/**
 * Format successful execution output
 */
function formatSuccessOutput(stdout: string, exitCode: number | null): string {
  const lines: string[] = [];

  lines.push('## Task Completed Successfully');
  lines.push('');

  if (stdout) {
    lines.push('### Output:');
    lines.push('```\n' + stdout.trim() + '\n```');
  }

  if (exitCode !== null) {
    lines.push('');
    lines.push(`Exit Code: ${exitCode}`);
  }

  return lines.join('\n');
}

/**
 * Format failed execution output
 */
function formatErrorOutput(result: {
  stderr: string;
  stdout: string;
  exitCode: number | null;
  error?: string;
}, task: string): string {
  const lines: string[] = [];

  lines.push('## Task Execution Failed');
  lines.push('');
  lines.push(`**Task:** ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
  lines.push('');

  if (result.error) {
    lines.push(`**Error:** ${result.error}`);
    lines.push('');
  }

  if (result.stderr) {
    lines.push('### Error Output:');
    lines.push('```\n' + result.stderr.trim() + '\n```');
    lines.push('');
  }

  if (result.stdout) {
    lines.push('### Standard Output:');
    lines.push('```\n' + result.stdout.trim() + '\n```');
    lines.push('');
  }

  if (result.exitCode !== null) {
    lines.push(`Exit Code: ${result.exitCode}`);
  }

  return lines.join('\n');
}
