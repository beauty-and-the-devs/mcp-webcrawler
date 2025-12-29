/**
 * crawl_video MCP Tool
 * Crawls TikTok video with tagged products
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlVideoInputSchema } from '../schemas/input.js';
import type { CrawlVideoOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { browserPool } from '../browser/pool.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { VideoExtractor } from '../extractors/video.js';
import { classifyPageType } from '../classifier/url-pattern.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_video';

export async function crawlVideo(args: unknown): Promise<CrawlVideoOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlVideoInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_video');

    await rateLimiter.acquire(TOOL_NAME);

    const browserContext = await browserPool.acquire();

    try {
      const page = await browserContext.newPage();

      const url = `https://www.tiktok.com/video/${input.video_id}`;
      logger.debug({ runId, url }, 'Navigating to video page');

      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        { maxRetries: 3, baseDelay: 1000 },
      );

      const pageType = classifyPageType(page.url());
      if (pageType !== 'video') {
        context.addError('PAGE_TYPE_MISMATCH', `Expected video, got ${pageType}`);
      }

      const extractor = new VideoExtractor(page, context);
      const result = await extractor.extract({
        videoId: input.video_id,
        includeTaggedProducts: true,
      });

      const video = result.video;
      const taggedProducts = result.taggedProducts || [];
      const edges: any[] = [];

      if (video) {
        entityStore.add('video', video.video_id, video);
      }

      // Create edges for products
      for (const product of taggedProducts) {
        const edge = {
          from_type: 'video',
          from_id: video?.video_id || input.video_id,
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
        video,
        tagged_products: taggedProducts,
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
    logger.error({ runId, error: errorMessage }, 'crawl_video failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      video: null,
      tagged_products: [],
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

export const crawlVideoTool = {
  name: TOOL_NAME,
  description: 'Crawl TikTok video with tagged products.',
  inputSchema: {
    type: 'object',
    properties: {
      video_id: { type: 'string', description: 'TikTok video ID' },
    },
    required: ['video_id'],
  },
  handler: crawlVideo,
};
