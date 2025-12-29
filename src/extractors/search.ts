/**
 * Search results extractor
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

export interface SearchProduct {
  product_id: string;
  product_name: string;
  price: {
    min: number;
    max: number;
    currency: string;
  };
  rating: number;
  review_count: number;
  sold_count: number | null;
  shop_name: string | null;
  is_ad: boolean;
  pdp_url: string;
}

export interface SearchExtractorInput {
  limit: number;
}

export interface SearchExtractorOutput {
  products: SearchProduct[];
  totalCount: number;
}

export class SearchExtractor extends BaseExtractor<SearchExtractorInput, SearchExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'search', options);
  }

  async extract(input: SearchExtractorInput): Promise<SearchExtractorOutput> {
    const { limit } = input;
    const products: SearchProduct[] = [];

    // Wait for search results
    const containerSelector = await this.waitForAny(this.getSelectors('results_container'));
    if (!containerSelector) {
      this.log.warn('Search results container not found');
      return { products: [], totalCount: 0 };
    }

    // Get total results count
    const totalText = await this.extractFromConfig('total_results');
    const totalCount = this.parseInt(totalText as string) ?? 0;

    // Scroll to load more results if needed
    let loadedCount = await this.countElements(this.getSelectors('result_item'));
    while (loadedCount < limit) {
      const scrollCount = await this.scrollToLoad(3);
      if (scrollCount === 0) break;

      const newCount = await this.countElements(this.getSelectors('result_item'));
      if (newCount === loadedCount) break;
      loadedCount = newCount;
    }

    // Find item selector
    const itemSelectors = this.getSelectors('result_item');
    let itemSelector = '';

    for (const s of itemSelectors) {
      const count = await this.countElements(s);
      if (count > 0) {
        itemSelector = s;
        break;
      }
    }

    if (!itemSelector) {
      this.log.warn('No search result items found');
      return { products: [], totalCount };
    }

    const elements = await this.page.$$(itemSelector);
    this.log.info({ found: elements.length, requested: limit }, 'Found search results');

    for (let i = 0; i < Math.min(elements.length, limit); i++) {
      const element = elements[i]!;

      try {
        const product = await this.extractSearchProduct(element);
        if (product) {
          products.push(product);
          this.context.recordTimestamp();
        }
      } catch (error) {
        this.log.warn({ index: i, error }, 'Failed to extract search result');
      }
    }

    return { products, totalCount: totalCount || products.length };
  }

  private async extractSearchProduct(
    element: Awaited<ReturnType<Page['$']>>,
  ): Promise<SearchProduct | null> {
    if (!element) return null;

    // Extract product ID
    const productIdLink = await element.$('a[href*="/product/"]');
    const href = productIdLink ? await productIdLink.getAttribute('href') : null;
    const productId = href ? this.parsePattern(href, '/product/(\\d+)') : null;

    if (!productId) return null;

    // Product name
    const nameSelectors = this.getSelectors('product_name');
    let productName = '';
    for (const s of nameSelectors) {
      const el = await element.$(s);
      if (el) {
        productName = (await el.textContent())?.trim() ?? '';
        if (productName) break;
      }
    }

    // Price
    const priceMinSelectors = this.getSelectors('price.min');
    let priceMinText = '';
    for (const s of priceMinSelectors) {
      const el = await element.$(s);
      if (el) {
        priceMinText = (await el.textContent())?.trim() ?? '';
        if (priceMinText) break;
      }
    }
    const priceMin = this.parseFloat(priceMinText) ?? 0;

    const priceMaxSelectors = this.getSelectors('price.max');
    let priceMaxText = '';
    for (const s of priceMaxSelectors) {
      const el = await element.$(s);
      if (el) {
        priceMaxText = (await el.textContent())?.trim() ?? '';
        if (priceMaxText) break;
      }
    }
    const priceMax = this.parseFloat(priceMaxText) ?? priceMin;

    // Rating
    const ratingSelectors = this.getSelectors('rating');
    let ratingText = '';
    for (const s of ratingSelectors) {
      const el = await element.$(s);
      if (el) {
        ratingText = (await el.textContent())?.trim() ?? '';
        if (ratingText) break;
      }
    }
    const rating = this.parseFloat(ratingText) ?? 0;

    // Review count
    const reviewSelectors = this.getSelectors('review_count');
    let reviewText = '';
    for (const s of reviewSelectors) {
      const el = await element.$(s);
      if (el) {
        reviewText = (await el.textContent())?.trim() ?? '';
        if (reviewText) break;
      }
    }
    const reviewCount = this.parseInt(reviewText) ?? 0;

    // Sold count
    const soldSelectors = this.getSelectors('sold_count');
    let soldText = '';
    for (const s of soldSelectors) {
      const el = await element.$(s);
      if (el) {
        soldText = (await el.textContent())?.trim() ?? '';
        if (soldText) break;
      }
    }
    const soldCount = this.parseCount(soldText);

    // Shop name
    const shopSelectors = this.getSelectors('shop_name');
    let shopName: string | null = null;
    for (const s of shopSelectors) {
      const el = await element.$(s);
      if (el) {
        shopName = (await el.textContent())?.trim() ?? null;
        if (shopName) break;
      }
    }

    // Is advertisement
    const adSelectors = this.getSelectors('is_ad');
    let isAd = false;
    for (const s of adSelectors) {
      const el = await element.$(s);
      if (el) {
        isAd = true;
        break;
      }
    }

    // Track fields
    this.context.trackField('product_id', productId);
    this.context.trackField('product_name', productName);
    this.context.trackField('price', priceMin);
    this.context.trackField('rating', rating);

    return {
      product_id: productId,
      product_name: productName,
      price: {
        min: priceMin,
        max: priceMax,
        currency: 'USD',
      },
      rating,
      review_count: reviewCount,
      sold_count: soldCount,
      shop_name: shopName,
      is_ad: isAd,
      pdp_url: `https://shop.tiktok.com/product/${productId}`,
    };
  }
}
