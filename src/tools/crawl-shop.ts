/**
 * crawl_shop MCP Tool
 * Crawls all products from a TikTok Shop store via ScrapeCreators API
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { RunContext } from '../store/run-context.js';
import { entityStore } from '../store/entity-store.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { scrapeCreatorsClient } from '../api/scrapecreators.js';
import { logger } from '../utils/logger.js';

const TOOL_NAME = 'crawl_shop';

const CrawlShopInputSchema = z.object({
  shop_url: z.string().describe('TikTok Shop store URL (e.g., https://www.tiktok.com/shop/store/goli-nutrition/7495794203056835079)'),
  max_products: z.number().default(50).describe('Maximum products to return'),
});

type CrawlShopInput = z.infer<typeof CrawlShopInputSchema>;

interface CrawlShopOutput {
  success: boolean;
  run_id: string;
  products: any[];
  total_count: number;
  shop_info: {
    shop_id: string;
    shop_name: string;
    product_count: number;
    sold_count: number;
    rating: number;
    follower_count: number;
  } | null;
  quality?: any;
  error?: string;
  metadata?: {
    crawled_at: string;
    page_url?: string;
    elapsed_ms: number;
  };
}

export async function crawlShop(args: unknown): Promise<CrawlShopOutput> {
  const runId = uuidv4();
  const context = new RunContext(runId, TOOL_NAME);
  const startTime = Date.now();

  try {
    const input = CrawlShopInputSchema.parse(args);
    logger.info({ runId, input }, 'Starting crawl_shop via ScrapeCreators API');

    await rateLimiter.acquire(TOOL_NAME);

    // Call ScrapeCreators API
    const response = await scrapeCreatorsClient.getShopProducts(input.shop_url);

    // Transform products to our format
    const allProducts = (response.products || []).map(scrapeCreatorsClient.transformProduct);
    const products = allProducts.slice(0, input.max_products);

    // Store products
    const storedProducts: any[] = [];
    for (const product of products) {
      const isNew = entityStore.add('shop_product', product.product_id || uuidv4(), product);
      if (isNew) {
        storedProducts.push(product);
      } else {
        context.incrementDuplicates();
      }
    }

    // Shop info
    const shopInfo = response.shop_info ? {
      shop_id: response.shop_info.seller_id,
      shop_name: response.shop_info.shop_name,
      product_count: response.shop_info.product_count,
      sold_count: response.shop_info.sold_count,
      rating: response.shop_info.rating,
      follower_count: response.shop_info.follower_count,
    } : null;

    const qualityReport = context.generateQualityReport();
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      run_id: runId,
      products: storedProducts,
      total_count: storedProducts.length,
      shop_info: shopInfo,
      quality: qualityReport,
      metadata: {
        crawled_at: new Date().toISOString(),
        page_url: input.shop_url,
        elapsed_ms: elapsedMs,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ runId, error: errorMessage }, 'crawl_shop failed');

    context.addError('CRAWL_ERROR', errorMessage);

    return {
      success: false,
      run_id: runId,
      products: [],
      total_count: 0,
      shop_info: null,
      quality: context.generateQualityReport(),
      error: errorMessage,
      metadata: {
        crawled_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
    };
  }
}

export const crawlShopTool = {
  name: TOOL_NAME,
  description: 'Get all products from a TikTok Shop store via ScrapeCreators API. Requires a full shop URL like https://www.tiktok.com/shop/store/{shop-name}/{shop-id}',
  inputSchema: {
    type: 'object',
    properties: {
      shop_url: {
        type: 'string',
        description: 'TikTok Shop store URL (e.g., https://www.tiktok.com/shop/store/goli-nutrition/7495794203056835079)'
      },
      max_products: {
        type: 'number',
        description: 'Maximum products to return',
        default: 50
      },
    },
    required: ['shop_url'],
  },
  handler: crawlShop,
};
