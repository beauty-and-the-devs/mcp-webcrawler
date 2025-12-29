/**
 * URL pattern-based page type classifier
 */

export type PageType =
  | 'category_rank'
  | 'search_result'
  | 'product_pdp'
  | 'reviews'
  | 'shop'
  | 'creator'
  | 'video'
  | 'unknown';

interface PatternRule {
  pattern: RegExp;
  pageType: PageType;
  priority: number;
  extractors?: Record<string, number>; // Named capture group indices
}

// URL patterns for TikTok Shop (ordered by priority)
const URL_PATTERNS: PatternRule[] = [
  // Reviews page (more specific, higher priority)
  {
    pattern: /\/shop\/product\/([^/]+)\/reviews/i,
    pageType: 'reviews',
    priority: 100,
    extractors: { product_id: 1 },
  },
  {
    pattern: /\/product\/([^/]+)\/reviews/i,
    pageType: 'reviews',
    priority: 100,
    extractors: { product_id: 1 },
  },

  // Product PDP
  {
    pattern: /\/shop\/product\/([^/?]+)/i,
    pageType: 'product_pdp',
    priority: 90,
    extractors: { product_id: 1 },
  },
  {
    pattern: /\/product\/([^/?]+)/i,
    pageType: 'product_pdp',
    priority: 90,
    extractors: { product_id: 1 },
  },

  // Search results
  {
    pattern: /\/shop\/search\?/i,
    pageType: 'search_result',
    priority: 80,
  },
  {
    pattern: /\/search\?.*(?:q|keyword)=/i,
    pageType: 'search_result',
    priority: 80,
  },

  // Category/Bestseller pages
  {
    pattern: /\/shop\/category\/([^/?]+)/i,
    pageType: 'category_rank',
    priority: 70,
    extractors: { category: 1 },
  },
  {
    pattern: /\/category\/([^/?]+)/i,
    pageType: 'category_rank',
    priority: 70,
    extractors: { category: 1 },
  },

  // Video pages (with creator)
  {
    pattern: /tiktok\.com\/@([^/]+)\/video\/([^/?]+)/i,
    pageType: 'video',
    priority: 65,
    extractors: { handle: 1, video_id: 2 },
  },

  // Video pages (direct)
  {
    pattern: /\/video\/([^/?]+)/i,
    pageType: 'video',
    priority: 60,
    extractors: { video_id: 1 },
  },

  // Shop/Seller pages
  {
    pattern: /\/shop\/seller\/([^/?]+)/i,
    pageType: 'shop',
    priority: 55,
    extractors: { shop_id: 1 },
  },
  {
    pattern: /\/shop\/store\/([^/?]+)/i,
    pageType: 'shop',
    priority: 55,
    extractors: { shop_id: 1 },
  },
  {
    pattern: /\/shop\/merchant\/([^/?]+)/i,
    pageType: 'shop',
    priority: 55,
    extractors: { shop_id: 1 },
  },

  // Creator profile (handle with @) - must be after video pattern
  {
    pattern: /tiktok\.com\/@([^/?]+)/i,
    pageType: 'creator',
    priority: 50,
    extractors: { handle: 1 },
  },
];

export interface ClassificationResult {
  pageType: PageType;
  confidence: number;
  extracted: Record<string, string>;
  matchedPattern?: string;
}

/**
 * Simple page type classification (returns just the type)
 */
export function classifyPageType(url: string): PageType {
  return classifyUrl(url).pageType;
}

/**
 * Classify a URL to determine the page type
 */
export function classifyUrl(url: string): ClassificationResult {
  const results: ClassificationResult[] = [];

  for (const rule of URL_PATTERNS) {
    const match = url.match(rule.pattern);
    if (match) {
      const extracted: Record<string, string> = {};

      if (rule.extractors) {
        for (const [name, index] of Object.entries(rule.extractors)) {
          if (match[index]) {
            extracted[name] = match[index];
          }
        }
      }

      results.push({
        pageType: rule.pageType,
        confidence: rule.priority / 100,
        extracted,
        matchedPattern: rule.pattern.source,
      });
    }
  }

  // Return highest priority match
  if (results.length > 0) {
    results.sort((a, b) => b.confidence - a.confidence);
    return results[0]!;
  }

  return {
    pageType: 'unknown',
    confidence: 0,
    extracted: {},
  };
}

/**
 * Extract product ID from URL
 */
export function extractProductId(url: string): string | null {
  // Try shop product URL first
  const shopMatch = url.match(/\/shop\/product\/([^/?]+)/i);
  if (shopMatch) return shopMatch[1] ?? null;

  // Try direct product URL
  const directMatch = url.match(/\/product\/([^/?]+)/i);
  return directMatch ? directMatch[1] ?? null : null;
}

/**
 * Extract video ID from URL
 */
export function extractVideoId(url: string): string | null {
  const match = url.match(/\/video\/([^/?]+)/i);
  return match ? match[1] ?? null : null;
}

/**
 * Extract creator handle from URL
 */
export function extractHandle(url: string): string | null {
  const match = url.match(/@([^/?]+)/i);
  return match ? `@${match[1]}` : null;
}

/**
 * Extract creator ID (username without @) from URL
 */
export function extractCreatorId(url: string): string | null {
  const match = url.match(/@([^/?]+)/i);
  return match ? match[1] ?? null : null;
}

/**
 * Extract category ID from URL
 */
export function extractCategoryId(url: string): string | null {
  const shopMatch = url.match(/\/shop\/category\/([^/?]+)/i);
  if (shopMatch) return shopMatch[1] ?? null;

  const directMatch = url.match(/\/category\/([^/?]+)/i);
  return directMatch ? directMatch[1] ?? null : null;
}

/**
 * Check if URL is a TikTok Shop URL
 */
export function isTikTokShopUrl(url: string): boolean {
  return /tiktok\.com\/shop\//i.test(url);
}

/**
 * Extract search keyword from URL
 */
export function extractSearchKeyword(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('q') || urlObj.searchParams.get('keyword');
  } catch {
    return null;
  }
}

/**
 * Build TikTok Shop URLs
 */
export const urlBuilder = {
  product(productId: string): string {
    return `https://shop.tiktok.com/product/${productId}`;
  },

  reviews(productId: string): string {
    return `https://shop.tiktok.com/product/${productId}/reviews`;
  },

  category(categoryPath: string): string {
    const encoded = encodeURIComponent(categoryPath.replace(/\//g, '-'));
    return `https://shop.tiktok.com/category/${encoded}`;
  },

  search(keyword: string, params?: Record<string, string>): string {
    const urlParams = new URLSearchParams({ q: keyword, ...params });
    return `https://shop.tiktok.com/search?${urlParams.toString()}`;
  },

  creator(handle: string): string {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    return `https://www.tiktok.com/@${cleanHandle}`;
  },

  video(videoId: string, handle?: string): string {
    if (handle) {
      const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
      return `https://www.tiktok.com/@${cleanHandle}/video/${videoId}`;
    }
    return `https://www.tiktok.com/video/${videoId}`;
  },

  shop(shopId: string): string {
    return `https://shop.tiktok.com/shop/${shopId}`;
  },
};
