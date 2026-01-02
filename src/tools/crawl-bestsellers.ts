/**
 * crawl_bestsellers MCP Tool
 * Crawls TikTok Shop category bestseller rankings
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlBestsellersInputSchema } from '../schemas/input.js';
import type { CrawlBestsellersOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { CategoryExtractor } from '../extractors/category.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_bestsellers';

export async function crawlBestsellers(args: unknown): Promise<CrawlBestsellersOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlBestsellersInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_bestsellers');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const url = `https://www.tiktok.com/shop/category/${input.category_id}?region=${input.country}`;
      logger.debug({ runId, url }, 'Navigating to category page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
          // Wait for TikTok Shop content to render
          await page.waitForTimeout(3000);
        },
        { maxRetries: 3, baseDelay: 2000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'category_rank') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected category_rank, got ${pageType}`);
      }

      const extractor = new CategoryExtractor(page, context);
      const result = await extractor.extract({
        topN: input.max_products,
        periodDays: 7,
        categoryPath: [input.category_id],
      });

      // Handle result
      const products: any[] = result.products || [];

      const storedProducts: any[] = [];
      for (const product of products) {
        const isNew = entityStore.add('bestseller', product.product_id || uuidv4(), product);
        if (isNew) {
          storedProducts.push(product);
        } else {
          context.incrementDuplicates();
        }
      }

      const qualityReport = context.generateQualityReport();
      const elapsedMs = Date.now() - startTime;

      await page.close().catch(() => {});
      browserPool.release(browserContext);

      return {
        success: true,
        run_id: runId,
        products: storedProducts,
        total_count: storedProducts.length,
        category_id: input.category_id,
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
    logger.error({ runId, error: errorMessage }, 'crawl_bestsellers failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      products: [],
      total_count: 0,
      category_id: (args as any)?.category_id || 'unknown',
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

export const crawlBestsellersTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok Shop category bestseller rankings.',
  inputSchema: {
    type: 'object',
    properties: {
      category_id: { type: 'string', description: 'TikTok Shop category ID' },
      country: { type: 'string', description: 'Country code', default: 'US' },
      max_products: { type: 'number', description: 'Maximum products to crawl', default: 50 },
    },
    required: ['category_id'],
  },
  handler: crawlBestsellers,
};
