/**
 * crawl_creator MCP Tool
 * Crawls TikTok creator profile via ScrapeCreators API
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlCreatorInputSchema } from '../schemas/input.js';
import type { CrawlCreatorOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_creator';

export async function crawlCreator(args: unknown): Promise<CrawlCreatorOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlCreatorInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_creator via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Clean up handle (remove @ if present)
    const handle = input.creator_id.startsWith('@')
      ? input.creator_id.slice(1)
      : input.creator_id;

    // Call ScrapeCreators API
    const response = await scrapeCreatorsClient.getProfile(handle);

    // Transform to our creator format
    const creator = response.user ? {
      creator_id: response.user.id,
      handle: response.user.uniqueId,
      nickname: response.user.nickname,
      avatar_url: response.user.avatarLarger,
      bio: response.user.signature,
      verified: response.user.verified,
      sec_uid: response.user.secUid,
      follower_count: response.stats?.followerCount ?? null,
      following_count: response.stats?.followingCount ?? null,
      heart_count: response.stats?.heart ?? null,
      video_count: response.stats?.videoCount ?? null,
    } : null;

    const promotedProducts: any[] = [];
    const edges: any[] = [];

    if (creator) {
      entityStore.add('creator', creator.creator_id, creator);
    }

    const qualityReport = context.generateQualityReport();
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      run_id: runId,
      creator,
      promoted_products: promotedProducts,
      edges,
      quality: qualityReport,
      metadata: {
        crawled_at: new Date().toISOString(),
        page_url: `https://www.tiktok.com/@${handle}`,
        elapsed_ms: elapsedMs,
      },
    };
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
  description: 'Get TikTok creator profile via ScrapeCreators API.',
  inputSchema: {
    type: 'object',
    properties: {
      creator_id: { type: 'string', description: 'TikTok creator username (with or without @)' },
      include_products: { type: 'boolean', description: 'Include promoted products (not yet supported)', default: false },
    },
    required: ['creator_id'],
  },
  handler: crawlCreator,
};
