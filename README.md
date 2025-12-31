# Back-Agent MCP Server

An MCP (Model Context Protocol) server that executes development tasks using Claude Code CLI.

## Features

- Execute tasks through Claude Code CLI via MCP protocol
- **Non-interactive mode by default** (`-p` flag auto-applied)
- Specify custom working directories
- Configurable timeout settings
- Comprehensive error handling and logging

## Prerequisites

- Node.js >= 18
- Claude Code CLI installed and available in PATH

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd back-agent-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Running the Server

```bash
# Development mode (with tsx)
npm run dev

# Production mode (built)
npm start
```

### Installation

```bash
npm install @zuens2020/back-agent-mcp
```

### Configuration with Claude Desktop

Add the following to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "back-agent": {
      "command": "node",
      "args": ["--experimental-modules", "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\node_modules\\@zuens2020\\back-agent-mcp\\dist\\index.js"]
    }
  }
}
```

Or using npx:

```json
{
  "mcpServers": {
    "back-agent": {
      "command": "npx",
      "args": ["-y", "@zuens2020/back-agent-mcp"]
    }
  }
}
```

### Available Tools

#### execute-task

Executes a development task using Claude Code CLI.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | Yes | The task description to execute |
| `workingDirectory` | string | No | Working directory for execution |
| `timeout` | number | No | Timeout in seconds (max 3600, default 300) |
| `additionalArgs` | string[] | No | Additional CLI arguments (excluding `-p` which is auto-added) |

**Example:**

```json
{
  "task": "Create a function that calculates fibonacci numbers",
  "workingDirectory": "C:\\Projects\\my-app",
  "timeout": 600
}
```

## Development

```bash
# Type checking
npm run typecheck

# Build
npm run build

# Development mode
npm run dev
```

## Project Structure

```
src/
├── index.ts                 # Main entry point
├── server/
│   └── tools/
│       └── execute-task.ts  # Task execution tool
├── claude/
│   └── executor.ts          # Claude Code CLI executor
└── utils/
    ├── logger.ts            # Logging utilities
    └── error-handler.ts     # Error handling
```

## Environment Variables

| Variable | Description | Values |
|----------|-------------|--------|
| `LOG_LEVEL` | Set logging verbosity | `DEBUG`, `INFO`, `WARN`, `ERROR` |

## License

MIT
