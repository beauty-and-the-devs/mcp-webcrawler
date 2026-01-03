/**
 * crawl_reviews MCP Tool
 * Note: ScrapeCreators API does not support fetching individual review text.
 * This tool returns review summary (rating, review_count) from product API.
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlReviewsInputSchema } from '../schemas/input.js';
import type { CrawlReviewsOutput, ReviewSummary } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_reviews';

export async function crawlReviews(args: unknown): Promise<CrawlReviewsOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlReviewsInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_reviews via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Build product URL and get product details (which includes rating/review_count)
    const productUrl = `https://www.tiktok.com/view/product/${input.product_id}`;

    // Call ScrapeCreators product API to get rating info
    const response = await scrapeCreatorsClient.getProductDetails(productUrl, false);

    // Extract review summary from product data
    const rating = response.seller?.rating ? parseFloat(response.seller.rating) : null;

    const summary: ReviewSummary = {
      average_rating: rating,
      rating_distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      total_with_media: 0,
      total_verified: 0,
      sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
      average_sentiment: null,
      sentiment_classification: 'unknown',
    };

    const qualityReport = context.generateQualityReport();
    const elapsedMs = Date.now() - startTime;

    // Note: Individual review text is not available via ScrapeCreators API
    context.addError('API_LIMITATION', 'ScrapeCreators does not support fetching individual review text. Only rating summary is available.');

    return {
      success: true,
      run_id: runId,
      reviews: [], // Individual reviews not available
      total_count: 0,
      product_id: input.product_id,
      summary,
      quality: qualityReport,
      metadata: {
        crawled_at: new Date().toISOString(),
        page_url: productUrl,
        elapsed_ms: elapsedMs,
      },
    };
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

export const crawlReviewsTool = {
  name: TOOL_NAME,
  description: 'Get TikTok Shop product review summary. Note: Individual review text is not available via API - only rating/review_count from product details.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'TikTok Shop product ID' },
      max_reviews: { type: 'number', description: 'Not used (API limitation)', default: 100 },
      sort_by: { type: 'string', enum: ['recent', 'helpful', 'rating_high', 'rating_low'], default: 'recent' },
      min_rating: { type: 'number', minimum: 1, maximum: 5 },
      include_media: { type: 'boolean', default: false },
    },
    required: ['product_id'],
  },
  handler: crawlReviews,
};
