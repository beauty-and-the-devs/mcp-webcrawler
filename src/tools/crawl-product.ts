/**
 * crawl_product MCP Tool
 * Crawls TikTok Shop product detail page
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlProductInputSchema } from '../schemas/input.js';
import type { CrawlProductOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { PDPExtractor } from '../extractors/pdp.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_product';

export async function crawlProduct(args: unknown): Promise<CrawlProductOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlProductInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_product');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const url = `https://www.tiktok.com/shop/product/${input.product_id}`;
      logger.debug({ runId, url }, 'Navigating to product page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        { maxRetries: 3, baseDelay: 1000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'product_pdp') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected product_pdp, got ${pageType}`);
      }

      const extractor = new PDPExtractor(page, context);
      const result = await extractor.extract({
        productId: input.product_id,
      });

      const product = result.product;

      if (product) {
        entityStore.add('product_detail', product.product_id, product);
      }

      const qualityReport = context.generateQualityReport();
      const elapsedMs = Date.now() - startTime;

      await page.close().catch(() => {});
      browserPool.release(browserContext);

      return {
        success: true,
        run_id: runId,
        product,
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
    logger.error({ runId, error: errorMessage }, 'crawl_product failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      product: null,
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

export const crawlProductTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok Shop product detail page.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'TikTok Shop product ID' },
      include_reviews: { type: 'boolean', description: 'Include reviews summary', default: false },
    },
    required: ['product_id'],
  },
  handler: crawlProduct,
};
