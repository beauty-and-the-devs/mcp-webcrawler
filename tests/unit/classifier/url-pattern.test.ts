/**
 * URL pattern classifier tests
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPageType,
  extractProductId,
  extractCreatorId,
  extractVideoId,
  extractCategoryId,
  isTikTokShopUrl,
} from '../../../src/classifier/url-pattern.js';

describe('classifyPageType', () => {
  describe('category_rank pages', () => {
    it('should classify category pages', () => {
      expect(classifyPageType('https://www.tiktok.com/shop/category/12345')).toBe('category_rank');
      expect(classifyPageType('https://www.tiktok.com/shop/category/beauty-123?region=US')).toBe('category_rank');
      expect(classifyPageType('https://tiktok.com/shop/category/electronics')).toBe('category_rank');
    });
  });

  describe('search_result pages', () => {
    it('should classify search pages', () => {
      expect(classifyPageType('https://www.tiktok.com/shop/search?q=makeup')).toBe('search_result');
      expect(classifyPageType('https://www.tiktok.com/shop/search?q=lipstick&sort=price')).toBe('search_result');
      expect(classifyPageType('https://tiktok.com/shop/search?keyword=skincare')).toBe('search_result');
    });
  });

  describe('product_pdp pages', () => {
    it('should classify product pages', () => {
      expect(classifyPageType('https://www.tiktok.com/shop/product/123456789')).toBe('product_pdp');
      expect(classifyPageType('https://tiktok.com/shop/product/abc123def')).toBe('product_pdp');
      expect(classifyPageType('https://www.tiktok.com/shop/product/123456789?variant=xl')).toBe('product_pdp');
    });
  });

  describe('reviews pages', () => {
    it('should classify review pages', () => {
      expect(classifyPageType('https://www.tiktok.com/shop/product/123456789/reviews')).toBe('reviews');
      expect(classifyPageType('https://tiktok.com/shop/product/abc123/reviews?sort=recent')).toBe('reviews');
    });
  });

  describe('shop pages', () => {
    it('should classify shop/seller pages', () => {
      expect(classifyPageType('https://www.tiktok.com/shop/seller/12345')).toBe('shop');
      expect(classifyPageType('https://tiktok.com/shop/store/mystore')).toBe('shop');
      expect(classifyPageType('https://www.tiktok.com/shop/merchant/abc123')).toBe('shop');
    });
  });

  describe('creator pages', () => {
    it('should classify creator profile pages', () => {
      expect(classifyPageType('https://www.tiktok.com/@username')).toBe('creator');
      expect(classifyPageType('https://tiktok.com/@cool_creator_123')).toBe('creator');
      expect(classifyPageType('https://www.tiktok.com/@creator?tab=videos')).toBe('creator');
    });
  });

  describe('video pages', () => {
    it('should classify video pages', () => {
      expect(classifyPageType('https://www.tiktok.com/video/1234567890123456789')).toBe('video');
      expect(classifyPageType('https://www.tiktok.com/@user/video/1234567890123456789')).toBe('video');
      expect(classifyPageType('https://tiktok.com/video/abc123')).toBe('video');
    });
  });

  describe('unknown pages', () => {
    it('should return unknown for unrecognized URLs', () => {
      expect(classifyPageType('https://www.tiktok.com/')).toBe('unknown');
      expect(classifyPageType('https://www.tiktok.com/foryou')).toBe('unknown');
      expect(classifyPageType('https://google.com')).toBe('unknown');
      expect(classifyPageType('invalid-url')).toBe('unknown');
    });
  });
});

describe('extractProductId', () => {
  it('should extract product ID from product URL', () => {
    expect(extractProductId('https://www.tiktok.com/shop/product/123456789')).toBe('123456789');
    expect(extractProductId('https://tiktok.com/shop/product/abc123def')).toBe('abc123def');
  });

  it('should extract product ID from review URL', () => {
    expect(extractProductId('https://www.tiktok.com/shop/product/123456789/reviews')).toBe('123456789');
  });

  it('should return null for non-product URLs', () => {
    expect(extractProductId('https://www.tiktok.com/@username')).toBeNull();
    expect(extractProductId('https://www.tiktok.com/shop/search?q=test')).toBeNull();
  });
});

describe('extractCreatorId', () => {
  it('should extract creator username from profile URL', () => {
    expect(extractCreatorId('https://www.tiktok.com/@username')).toBe('username');
    expect(extractCreatorId('https://tiktok.com/@cool_creator')).toBe('cool_creator');
  });

  it('should extract creator from video URL', () => {
    expect(extractCreatorId('https://www.tiktok.com/@user/video/123')).toBe('user');
  });

  it('should return null for non-creator URLs', () => {
    expect(extractCreatorId('https://www.tiktok.com/shop/product/123')).toBeNull();
    expect(extractCreatorId('https://www.tiktok.com/foryou')).toBeNull();
  });
});

describe('extractVideoId', () => {
  it('should extract video ID from video URL', () => {
    expect(extractVideoId('https://www.tiktok.com/video/1234567890123456789')).toBe('1234567890123456789');
    expect(extractVideoId('https://www.tiktok.com/@user/video/1234567890123456789')).toBe('1234567890123456789');
  });

  it('should return null for non-video URLs', () => {
    expect(extractVideoId('https://www.tiktok.com/@username')).toBeNull();
    expect(extractVideoId('https://www.tiktok.com/shop/product/123')).toBeNull();
  });
});

describe('extractCategoryId', () => {
  it('should extract category ID from category URL', () => {
    expect(extractCategoryId('https://www.tiktok.com/shop/category/12345')).toBe('12345');
    expect(extractCategoryId('https://tiktok.com/shop/category/beauty-skincare')).toBe('beauty-skincare');
  });

  it('should return null for non-category URLs', () => {
    expect(extractCategoryId('https://www.tiktok.com/shop/product/123')).toBeNull();
    expect(extractCategoryId('https://www.tiktok.com/@username')).toBeNull();
  });
});

describe('isTikTokShopUrl', () => {
  it('should return true for TikTok Shop URLs', () => {
    expect(isTikTokShopUrl('https://www.tiktok.com/shop/product/123')).toBe(true);
    expect(isTikTokShopUrl('https://tiktok.com/shop/category/beauty')).toBe(true);
    expect(isTikTokShopUrl('https://www.tiktok.com/shop/search?q=test')).toBe(true);
  });

  it('should return false for non-Shop TikTok URLs', () => {
    expect(isTikTokShopUrl('https://www.tiktok.com/@username')).toBe(false);
    expect(isTikTokShopUrl('https://www.tiktok.com/foryou')).toBe(false);
    expect(isTikTokShopUrl('https://www.tiktok.com/video/123')).toBe(false);
  });

  it('should return false for non-TikTok URLs', () => {
    expect(isTikTokShopUrl('https://google.com')).toBe(false);
    expect(isTikTokShopUrl('https://amazon.com/shop')).toBe(false);
  });
});
