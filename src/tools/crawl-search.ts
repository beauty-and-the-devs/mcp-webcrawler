/**
 * crawl_search MCP Tool
 * Crawls TikTok Shop search results
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlSearchInputSchema } from '../schemas/input.js';
import type { CrawlSearchOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { SearchExtractor } from '../extractors/search.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_search';

export async function crawlSearch(args: unknown): Promise<CrawlSearchOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlSearchInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_search');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const encodedKeyword = encodeURIComponent(input.keyword);
      const url = `https://www.tiktok.com/shop/search?q=${encodedKeyword}&region=${input.country}&sort=${input.sort_by}&page=${input.page}`;
      logger.debug({ runId, url }, 'Navigating to search page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        { maxRetries: 3, baseDelay: 1000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'search_result') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected search_result, got ${pageType}`);
      }

      const extractor = new SearchExtractor(page, context);
      const result = await extractor.extract({
        limit: input.max_products,
      });

      const products = result.products || [];

      const storedProducts: any[] = [];
      for (const product of products) {
        const isNew = entityStore.add('search_result', product.product_id || uuidv4(), product);
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
        keyword: input.keyword,
        page: input.page,
        has_more: storedProducts.length >= input.max_products,
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
    logger.error({ runId, error: errorMessage }, 'crawl_search failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      products: [],
      total_count: 0,
      keyword: (args as any)?.keyword || 'unknown',
      page: 1,
      has_more: false,
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

export const crawlSearchTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok Shop search results.',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'Search keyword' },
      country: { type: 'string', description: 'Country code', default: 'US' },
      max_products: { type: 'number', description: 'Maximum products', default: 50 },
      sort_by: { type: 'string', enum: ['relevance', 'price_low', 'price_high', 'sales', 'newest'], default: 'relevance' },
      page: { type: 'number', description: 'Page number', default: 1 },
    },
    required: ['keyword'],
  },
  handler: crawlSearch,
};
