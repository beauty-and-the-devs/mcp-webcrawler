/**
 * MCP Tool output schemas
 * Simplified for flexibility with actual crawl results
 */

import { z } from 'zod';
import { QualityReportSchema } from './entities.js';

// ============================================================================
// Common Response Types
// ============================================================================

export const MetadataSchema = z.object({
  crawled_at: z.string(),
  page_url: z.string().optional(),
  elapsed_ms: z.number(),
});

export const BaseResponseSchema = z.object({
  success: z.boolean(),
  run_id: z.string(),
  error: z.string().optional(),
  metadata: MetadataSchema.optional(),
});

// ============================================================================
// Simplified Product Schema for Output
// ============================================================================

export const SimpleProductSchema = z.object({
  product_id: z.string(),
  product_name: z.string().nullable(),
  current_price: z.number().nullable(),
  original_price: z.number().nullable(),
  sales_count: z.number().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  shop_id: z.string().nullable(),
  shop_name: z.string().nullable(),
  image_url: z.string().nullable(),
  product_url: z.string().nullable(),
});

export type SimpleProduct = z.infer<typeof SimpleProductSchema>;

// ============================================================================
// crawl_bestsellers Output
// ============================================================================

export const CrawlBestsellersOutputSchema = BaseResponseSchema.extend({
  products: z.array(z.any()),
  total_count: z.number(),
  category_id: z.string(),
  quality: QualityReportSchema.optional(),
});

export type CrawlBestsellersOutput = z.infer<typeof CrawlBestsellersOutputSchema>;

// ============================================================================
// crawl_product Output
// ============================================================================

export const CrawlProductOutputSchema = BaseResponseSchema.extend({
  product: z.any().nullable(),
  quality: QualityReportSchema.optional(),
});

export type CrawlProductOutput = z.infer<typeof CrawlProductOutputSchema>;

// ============================================================================
// crawl_reviews Output
// ============================================================================

export const ReviewSummarySchema = z.object({
  average_rating: z.number().nullable(),
  rating_distribution: z.record(z.number()),
  total_with_media: z.number(),
  total_verified: z.number(),
  sentiment_breakdown: z.object({
    positive: z.number(),
    neutral: z.number(),
    negative: z.number(),
  }),
  average_sentiment: z.number().nullable(),
  sentiment_classification: z.string().optional(),
});

export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const CrawlReviewsOutputSchema = BaseResponseSchema.extend({
  reviews: z.array(z.any()),
  total_count: z.number(),
  product_id: z.string(),
  summary: ReviewSummarySchema.optional(),
  quality: QualityReportSchema.optional(),
});

export type CrawlReviewsOutput = z.infer<typeof CrawlReviewsOutputSchema>;

// ============================================================================
// crawl_search Output
// ============================================================================

export const CrawlSearchOutputSchema = BaseResponseSchema.extend({
  products: z.array(z.any()),
  total_count: z.number(),
  keyword: z.string(),
  page: z.number(),
  has_more: z.boolean(),
  quality: QualityReportSchema.optional(),
});

export type CrawlSearchOutput = z.infer<typeof CrawlSearchOutputSchema>;

// ============================================================================
// crawl_creator Output
// ============================================================================

export const CrawlCreatorOutputSchema = BaseResponseSchema.extend({
  creator: z.any().nullable(),
  promoted_products: z.array(z.any()),
  edges: z.array(z.any()),
  quality: QualityReportSchema.optional(),
});

export type CrawlCreatorOutput = z.infer<typeof CrawlCreatorOutputSchema>;

// ============================================================================
// crawl_video Output
// ============================================================================

export const CrawlVideoOutputSchema = BaseResponseSchema.extend({
  video: z.any().nullable(),
  tagged_products: z.array(z.any()),
  edges: z.array(z.any()),
  quality: QualityReportSchema.optional(),
});

export type CrawlVideoOutput = z.infer<typeof CrawlVideoOutputSchema>;

// ============================================================================
// get_crawl_status Output
// ============================================================================

export const GetCrawlStatusOutputSchema = z.object({
  success: z.boolean(),
  run_id: z.string().optional(),
  run_status: z.any().optional(),
  recent_runs: z.array(z.any()).optional(),
  store_stats: z.record(z.number()).optional(),
  rate_limits: z.record(z.any()).optional(),
  browser_pool: z.any().optional(),
  error: z.string().optional(),
});

export type GetCrawlStatusOutput = z.infer<typeof GetCrawlStatusOutputSchema>;

// ============================================================================
// RunContext Output
// ============================================================================

export const RunContextOutputSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  ended_at: z.string().optional(),
  market: z.string(),
  locale: z.string(),
  timezone: z.string(),
  entrypoint: z.any(),
  crawler_version: z.string(),
});

export type RunContextOutput = z.infer<typeof RunContextOutputSchema>;

// ============================================================================
// Error Response Schema
// ============================================================================

export const ErrorCodeEnum = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'RATE_LIMITED',
  'BLOCKED',
  'PARSE_ERROR',
  'TIMEOUT',
  'INTERNAL_ERROR',
]);

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeEnum,
    message: z.string(),
    retry_after: z.number().int().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
