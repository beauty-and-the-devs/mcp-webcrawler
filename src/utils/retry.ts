/**
 * Retry utility with exponential backoff
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  baseDelay?: number; // Alias for initialDelayMs
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  baseDelay: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'TIMEOUT'],
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (error instanceof Error) {
    // Check error code
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && retryableErrors.includes(errorCode)) {
      return true;
    }

    // Check error message for timeout patterns
    if (error.message.toLowerCase().includes('timeout')) {
      return true;
    }

    // Don't retry BLOCKED or PARSE_ERROR
    if (error.message.includes('BLOCKED') || error.message.includes('PARSE_ERROR')) {
      return false;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = options.baseDelay ?? opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > opts.maxRetries) {
        break;
      }

      if (!isRetryableError(error, opts.retryableErrors)) {
        logger.warn(
          { error: lastError.message, attempt },
          'Non-retryable error encountered',
        );
        throw lastError;
      }

      logger.info(
        { error: lastError.message, attempt, nextRetryMs: delay },
        'Retrying after error',
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw new RetryError(
    `Failed after ${opts.maxRetries + 1} attempts: ${lastError?.message}`,
    opts.maxRetries + 1,
    lastError!,
  );
}
