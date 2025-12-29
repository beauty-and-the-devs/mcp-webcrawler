/**
 * crawl_creator MCP Tool
 * Crawls TikTok creator profile
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlCreatorInputSchema } from '../schemas/input.js';
import type { CrawlCreatorOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { CreatorExtractor } from '../extractors/creator.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_creator';

export async function crawlCreator(args: unknown): Promise<CrawlCreatorOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlCreatorInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_creator');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const creatorId = input.creator_id.startsWith('@') ? input.creator_id : `@${input.creator_id}`;
      const url = `https://www.tiktok.com/${creatorId}`;
      logger.debug({ runId, url }, 'Navigating to creator page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        { maxRetries: 3, baseDelay: 1000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'creator') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected creator, got ${pageType}`);
      }

      const extractor = new CreatorExtractor(page, context);
      const result = await extractor.extract({
        handle: input.creator_id,
        includeVideos: input.include_products,
        videoLimit: 10,
      });

      const creator = result.creator;
      const promotedProducts: any[] = [];
      const edges: any[] = [];

      if (creator) {
        entityStore.add('creator', creator.creator_id, creator);
      }

      // Create edges for products
      for (const product of promotedProducts) {
        const edge = {
          from_type: 'creator',
          from_id: creator?.creator_id || input.creator_id,
          to_type: 'product',
          to_id: product.product_id,
          edge_type: 'tags_product',
          metadata: {},
        };
        edges.push(edge);
      }

      const qualityReport = context.generateQualityReport();
      const elapsedMs = Date.now() - startTime;

      await page.close().catch(() => {});
      browserPool.release(browserContext);

      return {
        success: true,
        run_id: runId,
        creator,
        promoted_products: promotedProducts,
        edges,
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
    logger.error({ runId, error: errorMessage }, 'crawl_creator failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      creator: null,
      promoted_products: [],
      edges: [],
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

export const crawlCreatorTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok creator profile.',
  inputSchema: {
    type: 'object',
    properties: {
      creator_id: { type: 'string', description: 'TikTok creator username or ID' },
      include_products: { type: 'boolean', description: 'Include promoted products', default: true },
    },
    required: ['creator_id'],
  },
  handler: crawlCreator,
};
