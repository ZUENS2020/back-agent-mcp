/**
 * Claude Code CLI Executor
 *
 * Executes tasks by spawning Claude Code as a child process.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';
import { ErrorCode, McpServerError } from '../utils/error-handler.js';

export interface ExecutionOptions {
  /** Task description to execute */
  task: string;
  /** Working directory for Claude Code */
  workingDirectory?: string;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Additional CLI arguments for Claude Code */
  additionalArgs?: string[];
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Execute a task using Claude Code CLI
 */
export async function executeClaudeTask(options: ExecutionOptions): Promise<ExecutionResult> {
  const {
    task,
    workingDirectory,
    timeout = 300000,
    additionalArgs = [],
  } = options;

  logger.info(`Executing task: "${task.substring(0, 100)}${task.length > 100 ? '...' : ''}"`);

  // Use current working directory as default if not specified
  let cwd: string;
  if (workingDirectory) {
    cwd = resolve(workingDirectory);
  } else {
    // Default to current working directory
    cwd = process.cwd();
  }

  // Validate working directory exists
  if (!existsSync(cwd)) {
    throw new McpServerError(
      ErrorCode.INVALID_WORKING_DIRECTORY,
      `Working directory does not exist: ${cwd}`,
      { path: cwd }
    );
  }
  logger.info(`Using working directory: ${cwd}`);

  // Build CLI arguments (always specify working directory for claude --add-dir)
  const { args: cliArgs, cwd: spawnCwd } = buildCliArgs(task, cwd, additionalArgs);
  logger.debug(`Claude CLI args: ${JSON.stringify(cliArgs)}`);

  // Spawn the process
  const claude = spawn('claude', cliArgs, {
    cwd: spawnCwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true, // Use shell to find 'claude' in PATH
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  // Set timeout
  const timeoutHandle = setTimeout(() => {
    logger.warn(`Task timeout after ${timeout}ms, terminating process...`);
    timedOut = true;
    claude.kill('SIGTERM');
  }, timeout);

  // Collect stdout
  claude.stdout?.on('data', (data) => {
    const chunk = data.toString();
    stdout += chunk;
    logger.debug(`stdout: ${chunk.substring(0, 200)}`);
  });

  // Collect stderr
  claude.stderr?.on('data', (data) => {
    const chunk = data.toString();
    stderr += chunk;
    logger.debug(`stderr: ${chunk.substring(0, 200)}`);
  });

  // Wait for process to exit
  return new Promise<ExecutionResult>((resolve) => {
    claude.on('close', (code) => {
      clearTimeout(timeoutHandle);

      if (timedOut) {
        logger.error('Task execution timed out');
        resolve({
          success: false,
          stdout,
          stderr,
          exitCode: code,
          error: `Execution timed out after ${timeout}ms`,
        });
        return;
      }

      const success = code === 0;
      logger.info(`Task completed with exit code: ${code}`);

      resolve({
        success,
        stdout,
        stderr,
        exitCode: code,
      });
    });

    claude.on('error', (error) => {
      clearTimeout(timeoutHandle);

      // Check if Claude Code is not found
      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        logger.error('Claude Code CLI not found');
        resolve({
          success: false,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: 'Claude Code CLI not found. Please ensure Claude Code is installed and in your PATH.',
        });
        return;
      }

      logger.error(`Process error: ${error.message}`);
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: null,
        error: error.message,
      });
    });
  });
}

/**
 * Build CLI arguments for Claude Code
 */
function buildCliArgs(
  task: string,
  workingDirectory: string, // Now required - caller must provide default
  additionalArgs: string[] = []
): { args: string[]; cwd: string } {
  const args: string[] = [];

  // Always add working directory to allowed directories
  args.push('--add-dir', workingDirectory);

  // Filter out invalid arguments for claude CLI (npx/npm flags that might be passed through)
  const invalidArgs = new Set([
    '-p', '--print',
    '-y', '--yes',
    '-n', '--no', '--no-yes',
    '--cache',
    '--ignore-existing',
  ]);

  const filteredArgs = additionalArgs.filter(arg => !invalidArgs.has(arg));
  args.push(...filteredArgs);

  // Add -p flag for one-time execution (non-interactive mode)
  // This must come immediately before the task
  args.push('-p', task);

  // Return both args and cwd - the working directory will be used as spawn's cwd
  return { args, cwd: workingDirectory };
}
