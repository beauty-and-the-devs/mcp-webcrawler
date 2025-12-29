/**
 * get_crawl_status MCP Tool
 * Returns current crawl status and statistics
 */

import { v4 as uuidv4 } from 'uuid';
import { GetCrawlStatusInputSchema } from '../schemas/input.js';
import type { GetCrawlStatusOutput } from '../schemas/output.js';
import { entityStore } from '../store/entity-store.js';
import { runContextStore } from '../store/run-context.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'get_crawl_status';

export async function getCrawlStatus(args: unknown): Promise<GetCrawlStatusOutput> {
  const requestId = uuidv4();

  try {
    const input = GetCrawlStatusInputSchema.parse(args);
    logger.info({ requestId, input }, 'Getting crawl status');

    if (input.run_id) {
      const runContext = runContextStore.get(input.run_id);

      if (!runContext) {
        return {
          success: false,
          error: `Run ${input.run_id} not found`,
          store_stats: getStoreStats(),
          rate_limits: getRateLimitStatus(),
          browser_pool: getBrowserPoolStatus(),
        };
      }

      return {
        success: true,
        run_id: input.run_id,
        run_status: {
          tool_name: runContext.toolName,
          started_at: runContext.startedAt,
          status: runContext.status,
          error_count: runContext.getErrorCount(),
          duplicate_count: runContext.duplicateCount,
        },
        store_stats: getStoreStats(),
        rate_limits: getRateLimitStatus(),
        browser_pool: getBrowserPoolStatus(),
      };
    }

    const recentRuns = runContextStore.getRecent(10);

    return {
      success: true,
      recent_runs: recentRuns.map((run) => ({
        run_id: run.runId,
        tool_name: run.toolName,
        started_at: run.startedAt,
        status: run.status,
        error_count: run.getErrorCount(),
      })),
      store_stats: getStoreStats(),
      rate_limits: getRateLimitStatus(),
      browser_pool: getBrowserPoolStatus(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ requestId, error: errorMessage }, 'get_crawl_status failed');

    return {
      success: false,
      error: errorMessage,
      store_stats: getStoreStats(),
      rate_limits: getRateLimitStatus(),
      browser_pool: getBrowserPoolStatus(),
    };
  }
}

function getStoreStats(): Record<string, number> {
  return {
    bestseller_products: entityStore.count('bestseller'),
    products: entityStore.count('product'),
    reviews: entityStore.count('review'),
    creators: entityStore.count('creator'),
    videos: entityStore.count('video'),
    edges: entityStore.count('edge'),
    search_results: entityStore.count('search_result'),
    total_entities: entityStore.totalCount(),
  };
}

function getRateLimitStatus(): Record<string, any> {
  const tools = [
    'crawl_bestsellers',
    'crawl_product',
    'crawl_reviews',
    'crawl_search',
    'crawl_creator',
    'crawl_video',
  ];

  const status: Record<string, any> = {};

  for (const tool of tools) {
    const info = rateLimiter.getStatus(tool);
    status[tool] = {
      remaining: info.remaining,
      reset_in_ms: info.resetInMs,
    };
  }

  return status;
}

function getBrowserPoolStatus(): any {
  const stats = browserPool.getStats();
  return {
    active: stats.active,
    available: stats.available,
    max: stats.max,
  };
}

export const getCrawlStatusTool = {
  name: TOOL_NAME,
  description: 'Get current crawl status and statistics.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'Optional specific run ID' },
    },
    required: [],
  },
  handler: getCrawlStatus,
};
