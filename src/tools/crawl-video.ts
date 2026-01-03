/**
 * crawl_video MCP Tool
 * Crawls TikTok video details via ScrapeCreators API
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlVideoInputSchema } from '../schemas/input.js';
import type { CrawlVideoOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_video';

export async function crawlVideo(args: unknown): Promise<CrawlVideoOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlVideoInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_video via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Build video URL
    const videoUrl = `https://www.tiktok.com/video/${input.video_id}`;

    // Call ScrapeCreators API
    const response = await scrapeCreatorsClient.getVideoDetails(videoUrl);

    // Transform to our video format
    let video = null;
    const taggedProducts: any[] = [];
    const edges: any[] = [];

    if (response.aweme_detail) {
      const detail = response.aweme_detail;

      video = {
        video_id: detail.aweme_id,
        description: detail.desc || null,
        create_time: detail.create_time ? new Date(detail.create_time * 1000).toISOString() : null,
        author: {
          user_id: detail.author?.uid || null,
          handle: detail.author?.unique_id || null,
          nickname: detail.author?.nickname || null,
          avatar_url: detail.author?.avatar_thumb?.url_list?.[0] || null,
        },
        statistics: {
          play_count: detail.statistics?.play_count ?? null,
          like_count: detail.statistics?.digg_count ?? null,
          comment_count: detail.statistics?.comment_count ?? null,
          share_count: detail.statistics?.share_count ?? null,
          collect_count: detail.statistics?.collect_count ?? null,
        },
        video_info: {
          duration: detail.video?.duration ?? null,
          cover_url: detail.video?.cover?.url_list?.[0] || null,
        },
        music: detail.music ? {
          title: detail.music.title || null,
          author: detail.music.author || null,
        } : null,
        hashtags: detail.text_extra?.filter(t => t.hashtag_name).map(t => t.hashtag_name) || [],
        shop_product_url: detail.shop_product_url || null,
        transcript: response.transcript || null,
      };

      entityStore.add('video', video.video_id, video);

      // If there's a shop product URL, create an edge
      if (detail.shop_product_url) {
        // Extract product ID from URL if possible
        const productIdMatch = detail.shop_product_url.match(/product\/(\d+)/);
        if (productIdMatch) {
          const edge = {
            from_type: 'video',
            from_id: video.video_id,
            to_type: 'product',
            to_id: productIdMatch[1],
            edge_type: 'promotes_product',
            metadata: { url: detail.shop_product_url },
          };
          edges.push(edge);
        }
      }
    }

    const qualityReport = context.generateQualityReport();
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      run_id: runId,
      video,
      tagged_products: taggedProducts,
      edges,
      quality: qualityReport,
      metadata: {
        crawled_at: new Date().toISOString(),
        page_url: videoUrl,
        elapsed_ms: elapsedMs,
      },
    };
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
  description: 'Get TikTok video details via ScrapeCreators API. Supports video_id or full URL.',
  inputSchema: {
    type: 'object',
    properties: {
      video_id: { type: 'string', description: 'TikTok video ID or full video URL' },
    },
    required: ['video_id'],
  },
  handler: crawlVideo,
};
