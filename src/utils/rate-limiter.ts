/**
 * Rate limiter using token bucket algorithm
 */

import { logger } from './logger.js';

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
      logger.debug({ waitTime }, 'Rate limit reached, waiting');
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= 1;
  }

  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Tool-specific rate limiters (from api-spec.md)
export const rateLimiters = {
  crawl_bestsellers: new RateLimiter(10, 10 / 60), // 10/min
  crawl_product: new RateLimiter(30, 30 / 60), // 30/min
  crawl_reviews: new RateLimiter(20, 20 / 60), // 20/min
  crawl_search: new RateLimiter(20, 20 / 60), // 20/min
  crawl_creator: new RateLimiter(15, 15 / 60), // 15/min
  crawl_video: new RateLimiter(30, 30 / 60), // 30/min
};

export type ToolName = keyof typeof rateLimiters;

export async function acquireRateLimit(tool: ToolName): Promise<void> {
  const limiter = rateLimiters[tool];
  if (limiter) {
    await limiter.acquire();
  }
}

// Unified rate limiter manager
class RateLimiterManager {
  async acquire(tool: string): Promise<void> {
    const limiter = rateLimiters[tool as ToolName];
    if (limiter) {
      await limiter.acquire();
    }
  }

  getStatus(tool: string): { remaining: number; resetInMs: number } {
    const limiter = rateLimiters[tool as ToolName];
    if (!limiter) {
      return { remaining: 0, resetInMs: 0 };
    }

    const remaining = limiter.getAvailableTokens();
    // Calculate approximate time until next token
    const resetInMs = remaining < 1 ? Math.ceil((1 - (remaining % 1)) / (limiter['refillRate'] as number) * 1000) : 0;

    return { remaining, resetInMs };
  }
}

export const rateLimiter = new RateLimiterManager();
