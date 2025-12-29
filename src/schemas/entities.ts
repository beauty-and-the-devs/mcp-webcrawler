/**
 * Entity Zod schemas based on data-schema.md
 */

import { z } from 'zod';

// ============================================================================
// Price Schema
// ============================================================================

export const PriceSchema = z.object({
  min: z.number(),
  max: z.number(),
  currency: z.string().default('USD'),
});

export const DetailedPriceSchema = z.object({
  list_price: z.number().optional(),
  sale_price: z.number(),
  discount_rate: z.number().optional(),
  currency: z.string().default('USD'),
});

// ============================================================================
// BestsellerProduct Schema
// ============================================================================

export const BestsellerProductSchema = z.object({
  product_id: z.string(),
  product_name: z.string().max(500),
  category_path: z.array(z.string()),
  period_days: z.union([z.literal(7), z.literal(30)]),
  sales_rank: z.number().int().min(1).max(100),
  unit_sold: z.number().int().min(0).nullable(),
  gmv: z.number().min(0).nullable(),
  growth_rate_wow: z.number().nullable(),
  price: PriceSchema,
  rating: z.number().min(0).max(5),
  review_count: z.number().int().min(0),
  avg_sentiment_score: z.number().min(-1).max(1).nullable(),
  is_declining: z.boolean(),
  is_opportunity: z.boolean(),
  pdp_url: z.string().url(),
  shop_id: z.string().nullable(),
  shop_name: z.string().nullable(),
});

export type BestsellerProduct = z.infer<typeof BestsellerProductSchema>;

// ============================================================================
// ProductDetail Schema
// ============================================================================

export const ProductOptionSchema = z.object({
  option_id: z.string(),
  name: z.string(),
  values: z.array(z.string()),
  price_modifier: z.number().optional(),
});

export const ShopInfoSchema = z.object({
  shop_id: z.string(),
  shop_name: z.string(),
  shop_url: z.string().url().optional(),
  rating: z.number().optional(),
  follower_count: z.number().int().optional(),
});

export const ShippingInfoSchema = z.object({
  free_shipping: z.boolean(),
  estimated_days: z.number().int().optional(),
});

export const ProductDetailSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  description: z.string().optional(),
  category_path: z.array(z.string()).optional(),
  price: DetailedPriceSchema,
  options: z.array(ProductOptionSchema).default([]),
  images: z.array(z.string().url()).default([]),
  video_url: z.string().url().nullable(),
  rating: z.number().min(0).max(5),
  review_count: z.number().int().min(0),
  sold_count: z.number().int().nullable(),
  shop: ShopInfoSchema.nullable(),
  shipping: ShippingInfoSchema.nullable(),
  pdp_url: z.string().url(),
  collected_at: z.string().datetime(),
});

export type ProductDetail = z.infer<typeof ProductDetailSchema>;

// ============================================================================
// Review Schema
// ============================================================================

export const ReviewAuthorSchema = z.object({
  user_id: z.string().nullable(),
  display_name: z.string(),
  is_anonymous: z.boolean(),
  is_verified_buyer: z.boolean(),
});

export const ReviewSignalsSchema = z.object({
  text_len: z.number().int(),
  sentiment_score: z.number().min(-1).max(1).nullable(),
  complaint_keywords: z.array(z.string()).default([]),
  praise_keywords: z.array(z.string()).default([]),
  is_suspected_low_quality: z.boolean(),
  reliability_weight: z.number(),
});

export const MediaTypeEnum = z.enum(['TEXT_ONLY', 'WITH_IMAGE', 'WITH_VIDEO']);

export const ReviewSchema = z.object({
  review_id: z.string(),
  product_id: z.string(),
  created_at: z.string().datetime().nullable(),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
  media_type: MediaTypeEnum,
  media_urls: z.array(z.string().url()).default([]),
  author: ReviewAuthorSchema,
  option_purchased: z.string().nullable(),
  helpful_count: z.number().int().default(0),
  signals: ReviewSignalsSchema,
  collected_at: z.string().datetime(),
});

export type Review = z.infer<typeof ReviewSchema>;

// ============================================================================
// Creator Schema
// ============================================================================

export const CreatorTypeEnum = z.enum(['SALES', 'VIRAL', 'UNKNOWN']);

export const CreatorPerformanceSchema = z.object({
  avg_views: z.number().nullable(),
  avg_likes: z.number().nullable(),
  avg_comments: z.number().nullable(),
  avg_shares: z.number().nullable(),
  engagement_rate: z.number().nullable(),
  upload_frequency_per_week: z.number().nullable(),
  affiliate_gmv: z.number().nullable(), // Always null (TikTok private)
});

export const CreatorSchema = z.object({
  creator_id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  bio: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  follower_count: z.number().int().min(0),
  following_count: z.number().int().nullable(),
  total_likes: z.number().int().nullable(),
  video_count: z.number().int().nullable(),
  primary_categories: z.array(z.string()).nullable(),
  performance: CreatorPerformanceSchema,
  creator_type: CreatorTypeEnum.default('UNKNOWN'),
  profile_url: z.string().url(),
  collected_at: z.string().datetime(),
});

export type Creator = z.infer<typeof CreatorSchema>;

// ============================================================================
// Video Schema
// ============================================================================

export const ContentTypeEnum = z.enum(['VIDEO', 'LIVE', 'PRODUCT_CARD']).nullable();

export const VideoMetricsSchema = z.object({
  views: z.number().int().min(0),
  likes: z.number().int().min(0),
  comments: z.number().int().min(0),
  shares: z.number().int().nullable(),
  saves: z.number().int().nullable(),
});

export const TaggedProductSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  product_url: z.string().url(),
});

export const VideoSchema = z.object({
  video_id: z.string(),
  video_url: z.string().url(),
  creator_id: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  published_at: z.string().datetime(),
  duration_seconds: z.number().int().nullable(),
  metrics: VideoMetricsSchema,
  hashtags: z.array(z.string()).default([]),
  tagged_products: z.array(TaggedProductSchema).nullable(),
  content_type: ContentTypeEnum,
  thumbnail_url: z.string().url().nullable(),
  collected_at: z.string().datetime(),
});

export type Video = z.infer<typeof VideoSchema>;

// ============================================================================
// Edge Schema
// ============================================================================

export const EntityTypeEnum = z.enum(['video', 'creator', 'product', 'shop', 'review']);

export const EdgeTypeEnum = z.enum([
  'tags_product',
  'created_by',
  'sold_by',
  'reviewed_product',
  'related_to',
]);

export const EdgeSchema = z.object({
  from_type: EntityTypeEnum,
  from_id: z.string(),
  to_type: EntityTypeEnum,
  to_id: z.string(),
  edge_type: EdgeTypeEnum,
  metadata: z.record(z.unknown()).default({}),
});

export type Edge = z.infer<typeof EdgeSchema>;

// ============================================================================
// QualityReport Schema
// ============================================================================

export const QualityErrorSchema = z.object({
  url: z.string().optional(),
  error_code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  selector: z.string().optional(),
});

export const FreshnessSchema = z.object({
  oldest: z.string().datetime(),
  newest: z.string().datetime(),
});

export const QualityReportSchema = z.object({
  parse_success_rate: z.number().min(0).max(1),
  field_fill_rate: z.record(z.number()),
  duplicate_count: z.number().int().default(0),
  errors: z.array(QualityErrorSchema).default([]),
  blocked_suspected: z.boolean().default(false),
  freshness: FreshnessSchema.optional(),
});

export type QualityReport = z.infer<typeof QualityReportSchema>;
export type QualityError = z.infer<typeof QualityErrorSchema>;

// Additional type exports for extractors
export type ProductOption = z.infer<typeof ProductOptionSchema>;
export type ShopInfo = z.infer<typeof ShopInfoSchema>;
export type ShippingInfo = z.infer<typeof ShippingInfoSchema>;
export type ReviewAuthor = z.infer<typeof ReviewAuthorSchema>;
export type ReviewSignals = z.infer<typeof ReviewSignalsSchema>;
export type MediaType = z.infer<typeof MediaTypeEnum>;
export type VideoMetrics = z.infer<typeof VideoMetricsSchema>;
export type TaggedProduct = z.infer<typeof TaggedProductSchema>;
export type CreatorPerformance = z.infer<typeof CreatorPerformanceSchema>;

// ============================================================================
// Entities Container Schema
// ============================================================================

export const EntitiesSchema = z.object({
  products: z.array(BestsellerProductSchema).default([]),
  product_details: z.array(ProductDetailSchema).default([]),
  reviews: z.array(ReviewSchema).default([]),
  creators: z.array(CreatorSchema).default([]),
  videos: z.array(VideoSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
});

export type Entities = z.infer<typeof EntitiesSchema>;
