/**
 * crawl_reviews MCP Tool
 * Crawls TikTok Shop product reviews
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlReviewsInputSchema } from '../schemas/input.js';
import type { CrawlReviewsOutput, ReviewSummary } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { ReviewExtractor } from '../extractors/review.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_reviews';

export async function crawlReviews(args: unknown): Promise<CrawlReviewsOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlReviewsInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_reviews');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const url = `https://www.tiktok.com/shop/product/${input.product_id}/reviews?sort=${input.sort_by}`;
      logger.debug({ runId, url }, 'Navigating to reviews page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        { maxRetries: 3, baseDelay: 1000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'reviews') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected reviews, got ${pageType}`);
      }

      const extractor = new ReviewExtractor(page, context);
      const result = await extractor.extract({
        productId: input.product_id,
        limit: input.max_reviews,
        analyzeSentiment: true,
      });

      const reviews = result.reviews || [];

      const storedReviews: any[] = [];
      for (const review of reviews) {
        const isNew = entityStore.add('review', review.review_id || uuidv4(), review);
        if (isNew) {
          storedReviews.push(review);
        } else {
          context.incrementDuplicates();
        }
      }

      const summary = generateReviewSummary(storedReviews);
      const qualityReport = context.generateQualityReport();
      const elapsedMs = Date.now() - startTime;

      await page.close().catch(() => {});
      browserPool.release(browserContext);

      return {
        success: true,
        run_id: runId,
        reviews: storedReviews,
        total_count: storedReviews.length,
        product_id: input.product_id,
        summary,
        quality: qualityReport,
        metadata: {
          crawled_at: new Date().toISOString(),
          page_url: url,
          elapsed_ms: elapsedMs,
        },
      };
    } catch (innerError) {
      browserPool.release(browserContext);
      throw innerError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ runId, error: errorMessage }, 'crawl_reviews failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      reviews: [],
      total_count: 0,
      product_id: (args as any)?.product_id || 'unknown',
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

function generateReviewSummary(reviews: any[]): ReviewSummary {
  if (reviews.length === 0) {
    return {
      average_rating: null,
      rating_distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      total_with_media: 0,
      total_verified: 0,
      sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
      average_sentiment: null,
    };
  }

  const ratings = reviews.map((r) => r.rating).filter((r) => r != null);
  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const rating of ratings) {
    const key = String(Math.round(rating));
    if (key in distribution) distribution[key]++;
  }

  return {
    average_rating: avgRating,
    rating_distribution: distribution,
    total_with_media: reviews.filter((r) => r.media_urls?.length > 0).length,
    total_verified: reviews.filter((r) => r.author?.is_verified_buyer).length,
    sentiment_breakdown: { positive: 0, neutral: reviews.length, negative: 0 },
    average_sentiment: null,
  };
}

export const crawlReviewsTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok Shop product reviews.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'TikTok Shop product ID' },
      max_reviews: { type: 'number', description: 'Maximum reviews to crawl', default: 100 },
      sort_by: { type: 'string', enum: ['recent', 'helpful', 'rating_high', 'rating_low'], default: 'recent' },
      min_rating: { type: 'number', minimum: 1, maximum: 5 },
      include_media: { type: 'boolean', default: false },
    },
    required: ['product_id'],
  },
  handler: crawlReviews,
};
