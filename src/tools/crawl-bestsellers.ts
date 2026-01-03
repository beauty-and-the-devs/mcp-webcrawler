/**
 * crawl_bestsellers MCP Tool
 * NOT SUPPORTED: ScrapeCreators API does not have a category/bestsellers endpoint.
 * Use crawl_search with category keywords instead.
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlBestsellersInputSchema } from '../schemas/input.js';
import type { CrawlBestsellersOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_bestsellers';

export async function crawlBestsellers(args: unknown): Promise<CrawlBestsellersOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  const input = CrawlBestsellersInputSchema.parse(args);
  logger.info({ runId, input }, 'crawl_bestsellers called - NOT SUPPORTED');

  context.addError('NOT_SUPPORTED', 'Category bestsellers API is not available. Use crawl_search with category keywords instead.');

  return {
    success: false,
    run_id: runId,
    products: [],
    total_count: 0,
    category_id: input.category_id,
    quality: context.generateQualityReport(),
    error: 'NOT SUPPORTED: ScrapeCreators API does not have a category/bestsellers endpoint. Use crawl_search with category keywords (e.g., "beauty", "skincare") instead.',
    metadata: {
      crawled_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startTime,
    },
  };
}

export const crawlBestsellersTool = {
  name: TOOL_NAME,
  description: '[NOT SUPPORTED] Category bestsellers not available via API. Use crawl_search with category keywords instead.',
  inputSchema: {
    type: 'object',
    properties: {
      category_id: { type: 'string', description: 'TikTok Shop category ID (not supported)' },
      country: { type: 'string', description: 'Country code', default: 'US' },
      max_products: { type: 'number', description: 'Maximum products', default: 50 },
    },
    required: ['category_id'],
  },
  handler: crawlBestsellers,
};
