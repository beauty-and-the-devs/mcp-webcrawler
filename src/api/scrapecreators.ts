/**
 * ScrapeCreators API Client
 * Wrapper for TikTok Shop data extraction via ScrapeCreators API
 */

import { logger } from '../utils/logger.js';

const API_BASE_URL = 'https://api.scrapecreators.com/v1';
const API_KEY = process.env['SCRAPECREATORS_API_KEY'] || '';

interface ApiResponse<T> {
  success: boolean;
  credits_remaining?: number;
  error?: string;
  errorStatus?: number;
  message?: string;
  data?: T;
}

interface ShopProduct {
  product_id: string;
  title: string;
  image: {
    height: number;
    width: number;
    uri: string;
    url_list: string[];
  };
  product_price_info: {
    sale_price_decimal: string;
    origin_price_decimal: string;
    discount_format: string;
    currency_symbol: string;
  };
  rate_info: {
    score: number;
    review_count: string;
  };
  sold_info: {
    sold_count: number;
  };
  seller_info: {
    seller_id: string;
    shop_name: string;
    shop_logo?: {
      url_list: string[];
    };
  };
  seo_url?: {
    canonical_url: string;
  };
}

interface ShopProductsResponse {
  success: boolean;
  credits_remaining: number;
  products: ShopProduct[];
  shop_info?: {
    seller_id: string;
    shop_name: string;
    product_count: number;
    sold_count: number;
    rating: number;
    follower_count: number;
  };
}

interface SearchResponse {
  success: boolean;
  credits_remaining: number;
  products: ShopProduct[];
  total_count?: number;
  has_more?: boolean;
}

interface ProfileResponse {
  success: boolean;
  credits_remaining: number;
  user: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatarLarger: string;
    signature: string;
    verified: boolean;
    secUid: string;
  };
  stats: {
    followerCount: number;
    followingCount: number;
    heart: number;
    videoCount: number;
  };
}

interface ProductDetailResponse {
  success: boolean;
  credits_remaining: number;
  product_id: string;
  status: number;
  seller: {
    seller_id: string;
    name: string;
    avatar?: { url_list: string[] };
    product_count?: number;
    rating?: string;
  };
  product_base: {
    title: string;
    images: Array<{ url_list: string[] }>;
    specifications?: Array<{ name: string; value: string }>;
    sold_count: number;
    price: {
      original_price: string;
      real_price: string;
      discount: string;
      currency: string;
    };
    category_name?: string;
  };
  sale_props?: Array<{
    prop_name: string;
    sale_prop_values: Array<{
      prop_value: string;
      image?: { url_list: string[] };
    }>;
  }>;
}

interface VideoDetailResponse {
  success: boolean;
  credits_remaining: number;
  aweme_detail: {
    aweme_id: string;
    desc: string;
    create_time: number;
    author: {
      uid: string;
      unique_id: string;
      nickname: string;
      avatar_thumb?: { url_list: string[] };
    };
    statistics: {
      play_count: number;
      digg_count: number;
      comment_count: number;
      share_count: number;
      collect_count: number;
    };
    video: {
      duration: number;
      cover?: { url_list: string[] };
      play_addr?: { url_list: string[] };
    };
    music?: {
      title: string;
      author: string;
    };
    text_extra?: Array<{
      hashtag_name?: string;
    }>;
    shop_product_url?: string;
  };
  transcript?: string;
}

async function apiRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!API_KEY) {
    throw new Error('SCRAPECREATORS_API_KEY environment variable is not set');
  }

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  logger.debug({ endpoint, params }, 'ScrapeCreators API request');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json() as T & { success: boolean; error?: string; message?: string };

  if (!data.success) {
    const errorMsg = data.message || data.error || 'Unknown API error';
    logger.error({ endpoint, error: errorMsg }, 'ScrapeCreators API error');
    throw new Error(`ScrapeCreators API error: ${errorMsg}`);
  }

  logger.debug({ endpoint, success: true }, 'ScrapeCreators API response received');

  return data;
}

/**
 * Search TikTok Shop products by keyword
 */
export async function searchShopProducts(
  query: string,
  amount: number = 20
): Promise<SearchResponse> {
  return apiRequest<SearchResponse>('/tiktok/shop/search', {
    query,
    amount: String(amount),
  });
}

/**
 * Get all products from a TikTok Shop store
 */
export async function getShopProducts(shopUrl: string): Promise<ShopProductsResponse> {
  return apiRequest<ShopProductsResponse>('/tiktok/shop/products', {
    url: shopUrl,
  });
}

/**
 * Get TikTok product details by URL
 */
export async function getProductDetails(
  productUrl: string,
  getRelatedVideos: boolean = true
): Promise<ProductDetailResponse> {
  return apiRequest<ProductDetailResponse>('/tiktok/product', {
    url: productUrl,
    get_related_videos: String(getRelatedVideos),
  });
}

/**
 * Get TikTok user profile
 */
export async function getProfile(handle: string): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/tiktok/profile', {
    handle,
  });
}

/**
 * Get TikTok video details by URL
 */
export async function getVideoDetails(videoUrl: string): Promise<VideoDetailResponse> {
  return apiRequest<VideoDetailResponse>('/v2/tiktok/video', {
    url: videoUrl,
  });
}

/**
 * Transform ScrapeCreators product to our SimpleProduct format
 */
export function transformProduct(product: ShopProduct): {
  product_id: string;
  product_name: string | null;
  current_price: number | null;
  original_price: number | null;
  sales_count: number | null;
  rating: number | null;
  review_count: number | null;
  shop_id: string | null;
  shop_name: string | null;
  image_url: string | null;
  product_url: string | null;
} {
  return {
    product_id: product.product_id,
    product_name: product.title || null,
    current_price: product.product_price_info?.sale_price_decimal
      ? parseFloat(product.product_price_info.sale_price_decimal)
      : null,
    original_price: product.product_price_info?.origin_price_decimal
      ? parseFloat(product.product_price_info.origin_price_decimal)
      : null,
    sales_count: product.sold_info?.sold_count ?? null,
    rating: product.rate_info?.score ?? null,
    review_count: product.rate_info?.review_count
      ? parseInt(product.rate_info.review_count, 10)
      : null,
    shop_id: product.seller_info?.seller_id || null,
    shop_name: product.seller_info?.shop_name || null,
    image_url: product.image?.url_list?.[0] || null,
    product_url: product.seo_url?.canonical_url || null,
  };
}

export const scrapeCreatorsClient = {
  searchShopProducts,
  getShopProducts,
  getProductDetails,
  getProfile,
  getVideoDetails,
  transformProduct,
};
