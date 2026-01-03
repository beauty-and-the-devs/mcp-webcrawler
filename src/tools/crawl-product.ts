/**
 * crawl_product MCP Tool
 * Crawls TikTok Shop product detail via ScrapeCreators API
 */

import { v4 as uuidv4 } from 'uuid';
import { CrawlProductInputSchema } from '../schemas/input.js';
import type { CrawlProductOutput } from '../schemas/output.js';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_product';

export async function crawlProduct(args: unknown): Promise<CrawlProductOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlProductInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_product via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Build product URL
    const productUrl = `https://www.tiktok.com/view/product/${input.product_id}`;

    // Call ScrapeCreators API
    const response = await scrapeCreatorsClient.getProductDetails(
      productUrl,
      input.include_reviews ?? true
    );

    // Transform product to our format
    let product = null;
    if (response.product) {
      product = {
        product_id: response.product.product_id,
        product_name: response.product.title || null,
        description: response.product.description || null,
        current_price: response.product.price?.current ?? null,
        original_price: response.product.price?.original ?? null,
        currency: response.product.price?.currency || 'USD',
        discount: response.product.price?.discount || null,
        sales_count: response.product.sold_count ?? null,
        rating: response.product.rating ?? null,
        review_count: response.product.review_count ?? null,
        stock: response.product.stock ?? null,
        shop_id: response.product.seller?.id || null,
        shop_name: response.product.seller?.name || null,
        shop_logo: response.product.seller?.logo || null,
        images: response.product.images || [],
        related_videos: response.product.related_videos || [],
        product_url: productUrl,
      };

      entityStore.add('product_detail', product.product_id, product);
    }

    const qualityReport = context.generateQualityReport();
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      run_id: runId,
      product,
      quality: qualityReport,
      metadata: {
        crawled_at: new Date().toISOString(),
        page_url: productUrl,
        elapsed_ms: elapsedMs,
      },
    };
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
  description: 'Get TikTok Shop product details via ScrapeCreators API.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'TikTok Shop product ID' },
      include_reviews: { type: 'boolean', description: 'Include related videos', default: true },
    },
    required: ['product_id'],
  },
  handler: crawlProduct,
};
