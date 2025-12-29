/**
 * MCP Tool input schemas based on api-spec.md
 */

import { z } from 'zod';

// ============================================================================
// crawl_bestsellers Input
// ============================================================================

export const CrawlBestsellersInputSchema = z.object({
  category_id: z.string().describe('TikTok Shop category ID'),
  country: z.string().default('US').describe('Country code'),
  max_products: z.number().int().min(1).max(100).default(50).describe('Maximum products to crawl'),
});

export type CrawlBestsellersInput = z.infer<typeof CrawlBestsellersInputSchema>;

// ============================================================================
// crawl_product Input
// ============================================================================

export const CrawlProductInputSchema = z.object({
  product_id: z.string().describe('TikTok Shop product ID'),
});

export type CrawlProductInput = z.infer<typeof CrawlProductInputSchema>;

// ============================================================================
// crawl_reviews Input
// ============================================================================

export const CrawlReviewsInputSchema = z.object({
  product_id: z.string().describe('TikTok Shop product ID'),
  max_reviews: z.number().int().min(1).max(500).default(100).describe('Maximum reviews to crawl'),
  sort_by: z
    .enum(['recent', 'helpful', 'rating_high', 'rating_low'])
    .default('recent')
    .describe('Sort order'),
  min_rating: z.number().int().min(1).max(5).optional().describe('Minimum rating filter'),
  include_media: z.boolean().default(false).describe('Only include reviews with media'),
});

export type CrawlReviewsInput = z.infer<typeof CrawlReviewsInputSchema>;

// ============================================================================
// crawl_search Input
// ============================================================================

export const CrawlSearchInputSchema = z.object({
  keyword: z.string().describe('Search keyword'),
  country: z.string().default('US').describe('Country code'),
  max_products: z.number().int().min(1).max(200).default(50).describe('Maximum products'),
  sort_by: z
    .enum(['relevance', 'price_low', 'price_high', 'sales', 'newest'])
    .default('relevance')
    .describe('Sort order'),
  page: z.number().int().min(1).default(1).describe('Page number'),
});

export type CrawlSearchInput = z.infer<typeof CrawlSearchInputSchema>;

// ============================================================================
// crawl_creator Input (V1)
// ============================================================================

export const CrawlCreatorInputSchema = z.object({
  creator_id: z.string().describe('TikTok creator username or ID'),
  include_products: z.boolean().default(true).describe('Include promoted products'),
});

export type CrawlCreatorInput = z.infer<typeof CrawlCreatorInputSchema>;

// ============================================================================
// crawl_video Input (V1)
// ============================================================================

export const CrawlVideoInputSchema = z.object({
  video_id: z.string().describe('TikTok video ID'),
});

export type CrawlVideoInput = z.infer<typeof CrawlVideoInputSchema>;

// ============================================================================
// get_crawl_status Input
// ============================================================================

export const GetCrawlStatusInputSchema = z.object({
  run_id: z.string().optional().describe('Optional specific run ID'),
});

export type GetCrawlStatusInput = z.infer<typeof GetCrawlStatusInputSchema>;

// ============================================================================
// Export all input schemas as a map
// ============================================================================

export const inputSchemas = {
  crawl_bestsellers: CrawlBestsellersInputSchema,
  crawl_product: CrawlProductInputSchema,
  crawl_reviews: CrawlReviewsInputSchema,
  crawl_search: CrawlSearchInputSchema,
  crawl_creator: CrawlCreatorInputSchema,
  crawl_video: CrawlVideoInputSchema,
  get_crawl_status: GetCrawlStatusInputSchema,
} as const;
