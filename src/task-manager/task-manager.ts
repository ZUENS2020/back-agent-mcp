/**
 * Task Manager for Back-Agent MCP Server
 *
 * Manages concurrent task execution with status tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeClaudeTask, ExecutionResult } from '../claude/executor.js';
import { logger } from '../utils/logger.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  task: string;
  workingDirectory?: string;
  timeout: number;
  additionalArgs?: string[];
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: ExecutionResult;
  error?: string;
}

export interface CreateTaskOptions {
  task: string;
  workingDirectory?: string;
  timeout?: number;
  additionalArgs?: string[];
}

export interface TaskInfo {
  id: string;
  task: string;
  workingDirectory?: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  success?: boolean;
  exitCode?: number | null;
}

/**
 * Manages concurrent task execution
 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Create a new task and start executing it
   */
  async createTask(options: CreateTaskOptions): Promise<string> {
    const id = uuidv4();
    const task: Task = {
      id,
      task: options.task,
      workingDirectory: options.workingDirectory,
      timeout: options.timeout ?? 300,
      additionalArgs: options.additionalArgs,
      status: 'pending',
      createdAt: new Date(),
    };

    this.tasks.set(id, task);
    logger.info(`Task ${id} created: "${options.task.substring(0, 50)}..."`);

    // Start execution asynchronously
    this.executeTask(id);

    return id;
  }

  /**
   * Execute a task (runs asynchronously)
   */
  private async executeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
      logger.error(`Task ${id} not found`);
      return;
    }

    // Wait for available slot if max concurrent limit reached
    while (this.getRunningCount() >= this.maxConcurrent) {
      await this.sleep(100);
      // Check if task was cancelled while waiting
      if (task.status === 'cancelled') {
        return;
      }
    }

    if (task.status === 'cancelled') {
      return;
    }

    task.status = 'running';
    task.startedAt = new Date();
    logger.info(`Task ${id} started`);

    try {
      const result = await executeClaudeTask({
        task: task.task,
        workingDirectory: task.workingDirectory,
        timeout: task.timeout * 1000,
        additionalArgs: task.additionalArgs,
      });

      task.result = result;
      task.completedAt = new Date();

      if (result.success) {
        task.status = 'completed';
        logger.info(`Task ${id} completed successfully`);
      } else {
        task.status = 'failed';
        task.error = result.error ?? 'Task execution failed';
        logger.error(`Task ${id} failed: ${task.error}`);
      }
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
      logger.error(`Task ${id} error: ${task.error}`);
    }
  }

  /**
   * Get task status and info
   */
  getTask(id: string): TaskInfo | null {
    const task = this.tasks.get(id);
    if (!task) {
      return null;
    }

    return {
      id: task.id,
      task: task.task,
      workingDirectory: task.workingDirectory,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      error: task.error,
      success: task.result?.success,
      exitCode: task.result?.exitCode,
    };
  }

  /**
   * Get task result with full output
   */
  getTaskResult(id: string): {
    taskInfo: TaskInfo | null;
    stdout?: string;
    stderr?: string;
  } | null {
    const task = this.tasks.get(id);
    if (!task) {
      return null;
    }

    return {
      taskInfo: this.getTask(id)!,
      stdout: task.result?.stdout,
      stderr: task.result?.stderr,
    };
  }

  /**
   * List all tasks
   */
  listTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).map((task) => ({
      id: task.id,
      task: task.task,
      workingDirectory: task.workingDirectory,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      error: task.error,
      success: task.result?.success,
      exitCode: task.result?.exitCode,
    }));
  }

  /**
   * Cancel a task
   */
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    if (task.status === 'pending' || task.status === 'running') {
      task.status = 'cancelled';
      task.completedAt = new Date();
      logger.info(`Task ${id} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Delete a task from the task list
   */
  deleteTask(id: string): boolean {
    logger.info(`Task ${id} deleted`);
    return this.tasks.delete(id);
  }

  /**
   * Clean up old completed tasks
   */
  cleanup(olderThanMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.completedAt &&
        now - task.completedAt.getTime() > olderThanMs
      ) {
        this.tasks.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old tasks`);
    }

    return cleaned;
  }

  /**
   * Get count of currently running tasks
   */
  private getRunningCount(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'running') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = {
      total: this.tasks.size,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }

    return stats;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Global task manager instance
export const taskManager = new TaskManager(3);
