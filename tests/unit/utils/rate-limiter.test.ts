/**
 * Rate limiter tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, rateLimiters, rateLimiter } from '../../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  describe('basic functionality', () => {
    it('should allow acquisition when tokens are available', async () => {
      const limiter = new RateLimiter(5, 1); // 5 tokens, 1 per second refill

      // Should be able to acquire 5 times immediately
      for (let i = 0; i < 5; i++) {
        const acquired = limiter.tryAcquire();
        expect(acquired).toBe(true);
      }
    });

    it('should deny acquisition when tokens are exhausted', () => {
      const limiter = new RateLimiter(2, 0.1); // 2 tokens, slow refill

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should refill tokens over time', async () => {
      const limiter = new RateLimiter(1, 10); // 1 token, 10 per second refill

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(limiter.tryAcquire()).toBe(true);
    });

    it('should return available tokens', () => {
      const limiter = new RateLimiter(5, 1);

      expect(limiter.getAvailableTokens()).toBe(5);

      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(4);

      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(2);
    });

    it('should not exceed max tokens during refill', async () => {
      const limiter = new RateLimiter(3, 100); // 3 max tokens, fast refill

      // Wait for potential over-refill
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(limiter.getAvailableTokens()).toBe(3);
    });
  });

  describe('async acquire', () => {
    it('should wait when no tokens available', async () => {
      const limiter = new RateLimiter(1, 10); // 1 token, 10 per second

      const start = Date.now();

      // First acquire is immediate
      await limiter.acquire();

      // Second acquire should wait
      await limiter.acquire();

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50); // Should have waited
    });
  });
});

describe('rateLimiters', () => {
  it('should have limiters for all tools', () => {
    expect(rateLimiters).toHaveProperty('crawl_bestsellers');
    expect(rateLimiters).toHaveProperty('crawl_product');
    expect(rateLimiters).toHaveProperty('crawl_reviews');
    expect(rateLimiters).toHaveProperty('crawl_search');
    expect(rateLimiters).toHaveProperty('crawl_creator');
    expect(rateLimiters).toHaveProperty('crawl_video');
  });

  it('should have appropriate limits', () => {
    // crawl_bestsellers: 10/min
    expect(rateLimiters.crawl_bestsellers.getAvailableTokens()).toBe(10);

    // crawl_product: 30/min
    expect(rateLimiters.crawl_product.getAvailableTokens()).toBe(30);

    // crawl_reviews: 20/min
    expect(rateLimiters.crawl_reviews.getAvailableTokens()).toBe(20);

    // crawl_search: 20/min
    expect(rateLimiters.crawl_search.getAvailableTokens()).toBe(20);

    // crawl_creator: 15/min
    expect(rateLimiters.crawl_creator.getAvailableTokens()).toBe(15);

    // crawl_video: 30/min
    expect(rateLimiters.crawl_video.getAvailableTokens()).toBe(30);
  });
});

describe('rateLimiter manager', () => {
  it('should acquire rate limit for tool', async () => {
    // Should not throw
    await rateLimiter.acquire('crawl_product');
  });

  it('should return status for tool', () => {
    const status = rateLimiter.getStatus('crawl_product');

    expect(status).toHaveProperty('remaining');
    expect(status).toHaveProperty('resetInMs');
    expect(typeof status.remaining).toBe('number');
    expect(typeof status.resetInMs).toBe('number');
  });

  it('should return zero status for unknown tool', () => {
    const status = rateLimiter.getStatus('unknown_tool');

    expect(status.remaining).toBe(0);
    expect(status.resetInMs).toBe(0);
  });
});
