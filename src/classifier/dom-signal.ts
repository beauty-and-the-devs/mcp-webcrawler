/**
 * DOM signal-based page type classification
 * Secondary classification when URL pattern is ambiguous
 */

import type { Page } from 'playwright';
import type { PageType } from './url-pattern.js';
import { logger } from '../utils/logger.js';

interface DomSignal {
  pageType: PageType;
  selectors: string[];
  minMatches: number;
  weight: number;
}

// DOM signals for each page type
const DOM_SIGNALS: DomSignal[] = [
  // Product PDP signals
  {
    pageType: 'product_pdp',
    selectors: [
      '[data-testid="pdp-container"]',
      '.pdp-title',
      '.product-detail',
      '[class*="ProductDetail"]',
      '.add-to-cart',
      '[data-testid="add-to-cart"]',
    ],
    minMatches: 2,
    weight: 0.9,
  },

  // Reviews page signals
  {
    pageType: 'reviews',
    selectors: [
      '[data-testid="reviews-container"]',
      '.reviews-list',
      '.review-item',
      '[class*="ReviewList"]',
      '.rating-distribution',
    ],
    minMatches: 2,
    weight: 0.9,
  },

  // Search results signals
  {
    pageType: 'search_result',
    selectors: [
      '[data-testid="search-results"]',
      '.search-result-item',
      '.search-filters',
      '[class*="SearchResult"]',
      '.search-keyword',
    ],
    minMatches: 2,
    weight: 0.85,
  },

  // Category/Bestseller signals
  {
    pageType: 'category_rank',
    selectors: [
      '[data-testid="category-products"]',
      '.bestseller-list',
      '.category-header',
      '[class*="CategoryProduct"]',
      '.ranking-badge',
      '.sales-rank',
    ],
    minMatches: 2,
    weight: 0.85,
  },

  // Creator profile signals
  {
    pageType: 'creator',
    selectors: [
      '[data-testid="user-avatar"]',
      '.user-stats',
      '.follower-count',
      '[class*="UserProfile"]',
      '.user-bio',
      '.video-grid',
    ],
    minMatches: 3,
    weight: 0.8,
  },

  // Shop signals
  {
    pageType: 'shop',
    selectors: [
      '[data-testid="shop-header"]',
      '.shop-info',
      '.shop-products',
      '[class*="ShopProfile"]',
      '.shop-rating',
      '.shop-products-grid',
    ],
    minMatches: 2,
    weight: 0.8,
  },

  // Video signals
  {
    pageType: 'video',
    selectors: [
      '[data-testid="video-player"]',
      '.video-container',
      '.video-description',
      '[class*="VideoDetail"]',
      '.video-stats',
      '.tagged-products',
    ],
    minMatches: 2,
    weight: 0.85,
  },
];

// Blocked/CAPTCHA signals
const BLOCKED_SIGNALS = [
  '[data-testid="captcha"]',
  '.captcha-container',
  '#captcha',
  '[class*="Captcha"]',
  '.challenge-form',
  '[data-testid="challenge"]',
  '.verify-container',
  '.security-check',
];

export interface DomClassificationResult {
  pageType: PageType;
  confidence: number;
  matchedSignals: string[];
  isBlocked: boolean;
}

/**
 * Classify page type based on DOM signals
 */
export async function classifyByDom(page: Page): Promise<DomClassificationResult> {
  const results: Array<{
    pageType: PageType;
    matches: string[];
    score: number;
  }> = [];

  // Check for blocked/CAPTCHA
  let isBlocked = false;
  for (const selector of BLOCKED_SIGNALS) {
    try {
      const element = await page.$(selector);
      if (element) {
        isBlocked = true;
        logger.warn({ selector }, 'Blocked/CAPTCHA signal detected');
        break;
      }
    } catch {
      // Selector not found, continue
    }
  }

  // Check each page type's signals
  for (const signal of DOM_SIGNALS) {
    const matches: string[] = [];

    for (const selector of signal.selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          matches.push(selector);
        }
      } catch {
        // Selector not found, continue
      }
    }

    if (matches.length >= signal.minMatches) {
      const matchRatio = matches.length / signal.selectors.length;
      const score = signal.weight * matchRatio;

      results.push({
        pageType: signal.pageType,
        matches,
        score,
      });
    }
  }

  // Return best match
  if (results.length > 0) {
    results.sort((a, b) => b.score - a.score);
    const best = results[0]!;

    return {
      pageType: best.pageType,
      confidence: best.score,
      matchedSignals: best.matches,
      isBlocked,
    };
  }

  return {
    pageType: 'unknown',
    confidence: 0,
    matchedSignals: [],
    isBlocked,
  };
}

/**
 * Check if page appears to be blocked or showing CAPTCHA
 */
export async function isPageBlocked(page: Page): Promise<boolean> {
  for (const selector of BLOCKED_SIGNALS) {
    try {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    } catch {
      // Continue checking
    }
  }

  // Also check for common blocked text patterns
  try {
    const bodyText = await page.textContent('body');
    if (bodyText) {
      const blockedPatterns = [
        /access denied/i,
        /blocked/i,
        /captcha/i,
        /verify you are human/i,
        /security check/i,
        /too many requests/i,
        /rate limit/i,
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(bodyText)) {
          return true;
        }
      }
    }
  } catch {
    // Error reading body, might be blocked
  }

  return false;
}

/**
 * Wait for page to finish loading dynamic content
 */
export async function waitForDynamicContent(
  page: Page,
  options: { timeout?: number; minElements?: number } = {},
): Promise<boolean> {
  const { timeout = 10000, minElements = 3 } = options;

  try {
    // Wait for network to be mostly idle
    await page.waitForLoadState('networkidle', { timeout });

    // Check for minimum number of content elements
    const contentSelectors = [
      '.product-item',
      '.review-item',
      '.video-item',
      '[data-testid]',
      '.card',
      '.item',
    ];

    let totalElements = 0;
    for (const selector of contentSelectors) {
      const elements = await page.$$(selector);
      totalElements += elements.length;
    }

    return totalElements >= minElements;
  } catch {
    return false;
  }
}
