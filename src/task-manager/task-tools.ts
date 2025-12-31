/**
 * Task Management Tools for MCP Server
 *
 * Provides tools for managing concurrent task execution.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { taskManager, TaskInfo } from './task-manager.js';
import { logger } from '../utils/logger.js';
import { createErrorResponse } from '../utils/error-handler.js';

/**
 * Register all task management tools with the MCP server
 */
export function registerTaskManagementTools(server: McpServer): void {
  registerCreateTaskTool(server);
  registerGetTaskStatusTool(server);
  registerGetTaskResultTool(server);
  registerCancelTaskTool(server);
  registerListTasksTool(server);
  registerDeleteTaskTool(server);
  registerGetTaskStatsTool(server);

  logger.info('Registered task management tools');
}

/**
 * Create a new task
 */
const createTaskSchema = z.object({
  task: z.string().describe(
    'Natural language task description for Claude Code AI. ' +
    'This is NOT a direct shell command executor. Claude Code is an AI programming assistant ' +
    'that will interpret your request and use its own tools (Read, Edit, Bash, etc.) to complete the task. ' +
    'Example: "Create a README file" or "Fix the bug in login.js" or "Run the tests and report results"'
  ),
  workingDirectory: z.string().optional().describe(
    'The working directory for execution. ' +
    'Defaults to the current workspace directory if not specified.'
  ),
  timeout: z.number().min(1).max(3600).optional().describe('Timeout in seconds (max 3600)'),
  additionalArgs: z.array(z.string()).optional().describe('Additional CLI arguments'),
});

function registerCreateTaskTool(server: McpServer): void {
  server.registerTool(
    'create-task',
    {
      description: '**IMPORTANT: This creates a background task for an AI programming assistant, NOT a direct shell command executor.**\n\n' +
        'Spawns Claude Code (an AI coding agent) as a subprocess to complete development tasks in the background. ' +
        'Claude Code will interpret your natural language request and autonomously decide which actions to take.\n\n' +
        '**What it does:**\n' +
        '- Creates a non-blocking background task\n' +
        '- Returns task ID immediately for tracking\n' +
        '- Up to 3 tasks run concurrently by default\n\n' +
        '**What it does NOT do:**\n' +
        '- NOT a direct shell/bash command executor\n' +
        '- Does NOT return raw stdout/stddr from commands\n\n' +
        'Returns a task ID. Use get-task-status to check progress and get-task-result to retrieve the output.',
      inputSchema: createTaskSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = createTaskSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { task, workingDirectory, timeout, additionalArgs } = result.data;

      try {
        const taskId = await taskManager.createTask({
          task,
          workingDirectory,
          timeout,
          additionalArgs,
        });

        logger.info(`Created task ${taskId}`);

        return {
          content: [{
            type: 'text',
            text: `## Task Created\n\n` +
              `**Task ID:** ${taskId}\n` +
              `**Task:** ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}\n` +
              `**Status:** pending\n\n` +
              `Use \`get-task-status\` with ID \`${taskId}\` to check progress.\n` +
              `Use \`get-task-result\` with ID \`${taskId}\` to get the result when complete.`,
          }],
        };
      } catch (error) {
        logger.error(`Error creating task: ${error}`);
        return createErrorResponse(error);
      }
    }
  );
}

/**
 * Get task status
 */
const getTaskStatusSchema = z.object({
  taskId: z.string().describe('The task ID'),
});

function registerGetTaskStatusTool(server: McpServer): void {
  server.registerTool(
    'get-task-status',
    {
      description: 'Get the current status of a task. Returns status, timestamps, and basic info.',
      inputSchema: getTaskStatusSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = getTaskStatusSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { taskId } = result.data;
      const taskInfo = taskManager.getTask(taskId);

      if (!taskInfo) {
        return {
          content: [{
            type: 'text',
            text: `## Task Not Found\n\nTask with ID \`${taskId}\` does not exist.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: formatTaskInfo(taskInfo),
        }],
      };
    }
  );
}

/**
 * Get task result with full output
 */
function registerGetTaskResultTool(server: McpServer): void {
  server.registerTool(
    'get-task-result',
    {
      description: 'Get the full result of a task including stdout/stderr output. ' +
        'Only available for completed tasks.',
      inputSchema: getTaskStatusSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = getTaskStatusSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { taskId } = result.data;
      const taskResult = taskManager.getTaskResult(taskId);

      if (!taskResult) {
        return {
          content: [{
            type: 'text',
            text: `## Task Not Found\n\nTask with ID \`${taskId}\` does not exist.`,
          }],
          isError: true,
        };
      }

      const { taskInfo, stdout, stderr } = taskResult;

      // taskInfo is guaranteed to be non-null here since taskResult was not null
      if (!taskInfo) {
        return {
          content: [{
            type: 'text',
            text: `## Task Not Found\n\nTask with ID \`${taskId}\` does not exist.`,
          }],
          isError: true,
        };
      }

      let output = formatTaskInfo(taskInfo);

      if (taskInfo.status === 'running' || taskInfo.status === 'pending') {
        output += `\n\n**Note:** Task is still ${taskInfo.status}. Result not available yet.`;
      } else if (stdout !== undefined || stderr !== undefined) {
        if (stdout) {
          output += `\n\n### Standard Output:\n\`\`\`\n${stdout.trim()}\n\`\`\``;
        }
        if (stderr) {
          output += `\n\n### Standard Error:\n\`\`\`\n${stderr.trim()}\n\`\`\``;
        }
      }

      return {
        content: [{
          type: 'text',
          text: output,
        }],
      };
    }
  );
}

/**
 * Cancel a task
 */
function registerCancelTaskTool(server: McpServer): void {
  server.registerTool(
    'cancel-task',
    {
      description: 'Cancel a pending or running task.',
      inputSchema: getTaskStatusSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = getTaskStatusSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { taskId } = result.data;
      const cancelled = taskManager.cancelTask(taskId);

      if (!cancelled) {
        const taskInfo = taskManager.getTask(taskId);
        if (!taskInfo) {
          return {
            content: [{
              type: 'text',
              text: `## Task Not Found\n\nTask with ID \`${taskId}\` does not exist.`,
            }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text',
            text: `## Cannot Cancel Task\n\nTask with ID \`${taskId}\` is ${taskInfo.status} and cannot be cancelled.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: `## Task Cancelled\n\nTask \`${taskId}\` has been cancelled.`,
        }],
      };
    }
  );
}

/**
 * Delete a task from the task list
 */
function registerDeleteTaskTool(server: McpServer): void {
  server.registerTool(
    'delete-task',
    {
      description: 'Delete a task from the task list. Use this to clean up old completed tasks.',
      inputSchema: getTaskStatusSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = getTaskStatusSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { taskId } = result.data;
      const deleted = taskManager.deleteTask(taskId);

      if (!deleted) {
        return {
          content: [{
            type: 'text',
            text: `## Task Not Found\n\nTask with ID \`${taskId}\` does not exist.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: `## Task Deleted\n\nTask \`${taskId}\` has been deleted from the task list.`,
        }],
      };
    }
  );
}

/**
 * List all tasks
 */
const listTasksSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional()
    .describe('Filter by status (optional)'),
  limit: z.number().optional().describe('Maximum number of tasks to return (default: 50)'),
});

function registerListTasksTool(server: McpServer): void {
  server.registerTool(
    'list-tasks',
    {
      description: 'List all tasks, optionally filtered by status.',
      inputSchema: listTasksSchema,
    },
    async (input: unknown): Promise<CallToolResult> => {
      const result = listTasksSchema.safeParse(input);
      if (!result.success) {
        return createErrorResponse(new Error(`Invalid input: ${result.error.errors.map(e => e.message).join(', ')}`));
      }

      const { status, limit } = result.data;
      let tasks = taskManager.listTasks();

      if (status) {
        tasks = tasks.filter(t => t.status === status);
      }

      if (limit) {
        tasks = tasks.slice(0, limit);
      }

      if (tasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `## No Tasks Found\n\n${status ? `No tasks with status "${status}".` : 'No tasks found.'}`,
          }],
        };
      }

      const stats = taskManager.getStats();
      let output = `## Tasks (${tasks.length} shown)\n\n`;
      output += `**Stats:** ${stats.pending} pending, ${stats.running} running, ${stats.completed} completed, ${stats.failed} failed, ${stats.cancelled} cancelled\n\n`;

      for (const task of tasks) {
        output += formatTaskInfoShort(task);
      }

      return {
        content: [{
          type: 'text',
          text: output,
        }],
      };
    }
  );
}

/**
 * Get task statistics
 */
function registerGetTaskStatsTool(server: McpServer): void {
  server.registerTool(
    'get-task-stats',
    {
      description: 'Get statistics about all tasks.',
      inputSchema: z.object({}).optional(),
    },
    async (): Promise<CallToolResult> => {
      const stats = taskManager.getStats();

      let output = `## Task Statistics\n\n`;
      output += `| Status | Count |\n`;
      output += `|--------|-------|\n`;
      output += `| Total | ${stats.total} |\n`;
      output += `| Pending | ${stats.pending} |\n`;
      output += `| Running | ${stats.running} |\n`;
      output += `| Completed | ${stats.completed} |\n`;
      output += `| Failed | ${stats.failed} |\n`;
      output += `| Cancelled | ${stats.cancelled} |\n`;

      return {
        content: [{
          type: 'text',
          text: output,
        }],
      };
    }
  );
}

/**
 * Format task info for display
 */
function formatTaskInfo(task: TaskInfo): string {
  let output = `## Task ${task.id}\n\n`;
  output += `| Property | Value |\n`;
  output += `|----------|-------|\n`;
  output += `| Status | **${task.status}** |\n`;
  output += `| Task | ${task.task.substring(0, 100)}${task.task.length > 100 ? '...' : ''} |\n`;
  if (task.workingDirectory) {
    output += `| Working Directory | \`${task.workingDirectory}\` |\n`;
  }
  output += `| Created | ${new Date(task.createdAt).toLocaleString()} |\n`;

  if (task.startedAt) {
    output += `| Started | ${new Date(task.startedAt).toLocaleString()} |\n`;
  }
  if (task.completedAt) {
    output += `| Completed | ${new Date(task.completedAt).toLocaleString()} |\n`;

    const started = new Date(task.startedAt ?? task.createdAt).getTime();
    const completed = new Date(task.completedAt).getTime();
    const duration = ((completed - started) / 1000).toFixed(1);
    output += `| Duration | ${duration}s |\n`;
  }
  if (task.success !== undefined) {
    output += `| Success | ${task.success ? 'Yes' : 'No'} |\n`;
  }
  if (task.exitCode !== undefined && task.exitCode !== null) {
    output += `| Exit Code | ${task.exitCode} |\n`;
  }
  if (task.error) {
    output += `| Error | ${task.error} |\n`;
  }

  return output;
}

/**
 * Format short task info for list display
 */
function formatTaskInfoShort(task: TaskInfo): string {
  const statusEmoji = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    cancelled: '🛑',
  };

  let output = `### ${statusEmoji[task.status]} ${task.id}\n\n`;
  output += `- **Status:** ${task.status}\n`;
  output += `- **Task:** ${task.task.substring(0, 80)}${task.task.length > 80 ? '...' : ''}\n`;
  output += `- **Created:** ${new Date(task.createdAt).toLocaleString()}\n`;

  if (task.status === 'running' && task.startedAt) {
    const elapsed = ((Date.now() - new Date(task.startedAt).getTime()) / 1000).toFixed(0);
    output += `- **Elapsed:** ${elapsed}s\n`;
  } else if (task.completedAt && task.startedAt) {
    const duration = ((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000).toFixed(1);
    output += `- **Duration:** ${duration}s\n`;
  }

  output += '\n';

  return output;
}
