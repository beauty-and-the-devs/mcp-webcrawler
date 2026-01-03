/**
 * crawl_search MCP Tool
 * Crawls TikTok Shop search results via ScrapeCreators API
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlSearchInputSchema } from '../schemas/input.js';
import type { CrawlSearchOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_search';

export async function crawlSearch(args: unknown): Promise<CrawlSearchOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlSearchInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_search via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Call ScrapeCreators API
    const response = await scrapeCreatorsClient.searchShopProducts(
      input.keyword,
      input.max_products
    );

    // Transform products to our format
    const products = (response.products || []).map(scrapeCreatorsClient.transformProduct);

    // Store products
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
        page_url: `https://api.scrapecreators.com/v1/tiktok/shop/search?query=${encodeURIComponent(input.keyword)}`,
        elapsed_ms: elapsedMs,
      },
    };
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
  description: 'Search TikTok Shop products by keyword via ScrapeCreators API.',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'Search keyword' },
      country: { type: 'string', description: 'Country code (for reference)', default: 'US' },
      max_products: { type: 'number', description: 'Maximum products to return', default: 20 },
      sort_by: { type: 'string', enum: ['relevance', 'price_low', 'price_high', 'sales', 'newest'], default: 'relevance' },
      page: { type: 'number', description: 'Page number (for reference)', default: 1 },
    },
    required: ['keyword'],
  },
  handler: crawlSearch,
};
