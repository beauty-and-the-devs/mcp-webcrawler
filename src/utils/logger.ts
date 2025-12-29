/**
 * Logger utility using pino
 * CRITICAL: All logs must go to stderr, never stdout (MCP uses stdio for JSON-RPC)
 */

import pino from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

// Create logger that writes to stderr only
export const logger = pino({
  level: LOG_LEVEL,
  transport: {
    target: 'pino/file',
    options: {
      destination: 2, // stderr file descriptor
    },
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Child logger factory for adding context
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// Convenience methods with run_id context
export function logWithRunId(runId: string) {
  return logger.child({ run_id: runId });
}

// Type exports
export type Logger = pino.Logger;
