/**
 * Category/Bestseller extractor
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { BestsellerProduct } from '../schemas/entities.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

export interface CategoryExtractorInput {
  topN: number;
  periodDays: 7 | 30;
  categoryPath: string[];
}

export interface CategoryExtractorOutput {
  products: BestsellerProduct[];
  totalFound: number;
}

export class CategoryExtractor extends BaseExtractor<CategoryExtractorInput, CategoryExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'category', options);
  }

  async extract(input: CategoryExtractorInput): Promise<CategoryExtractorOutput> {
    const { topN, periodDays, categoryPath } = input;
    const products: BestsellerProduct[] = [];

    // Wait for product list to load
    const listSelector = await this.waitForAny(this.getSelectors('product_list'));
    if (!listSelector) {
      this.log.warn('Product list not found');
      return { products: [], totalFound: 0 };
    }

    // Scroll to load more products if needed
    let loadedCount = await this.countElements(this.getSelectors('product_item'));
    while (loadedCount < topN) {
      const scrollCount = await this.scrollToLoad(3);
      if (scrollCount === 0) break;

      const newCount = await this.countElements(this.getSelectors('product_item'));
      if (newCount === loadedCount) break;
      loadedCount = newCount;
    }

    // Extract product items
    const itemSelectors = this.getSelectors('product_item');
    let itemSelector = '';

    for (const s of itemSelectors) {
      const count = await this.countElements(s);
      if (count > 0) {
        itemSelector = s;
        break;
      }
    }

    if (!itemSelector) {
      this.log.warn('No product items found');
      return { products: [], totalFound: 0 };
    }

    const elements = await this.page.$$(itemSelector);
    const total = elements.length;

    this.log.info({ found: total, requested: topN }, 'Found product items');

    for (let i = 0; i < Math.min(elements.length, topN); i++) {
      const element = elements[i]!;
      const rank = i + 1;

      try {
        const product = await this.extractProduct(element, rank, periodDays, categoryPath);
        if (product) {
          products.push(product);
          this.context.recordTimestamp();
        }
      } catch (error) {
        this.log.warn({ rank, error }, 'Failed to extract product');
        this.context.addError({
          field: `product_${rank}`,
          error_code: 'PARSE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { products, totalFound: total };
  }

  private async extractProduct(
    element: ReturnType<Page['$']> extends Promise<infer T> ? NonNullable<T> : never,
    rank: number,
    periodDays: 7 | 30,
    categoryPath: string[],
  ): Promise<BestsellerProduct | null> {
    // Extract product ID from link
    const productIdLink = await element.$('a[href*="/product/"]');
    const href = productIdLink ? await productIdLink.getAttribute('href') : null;
    const productId = href ? this.parsePattern(href, '/product/(\\d+)') : null;

    if (!productId) {
      return null;
    }

    // Extract product name
    const nameSelectors = this.getSelectors('product_name');
    let productName = '';
    for (const s of nameSelectors) {
      const nameEl = await element.$(s);
      if (nameEl) {
        productName = (await nameEl.textContent())?.trim() ?? '';
        if (productName) break;
      }
    }

    // Extract price
    const priceMinText = await this.extractTextFromElement(element, this.getSelectors('price.min'));
    const priceMaxText = await this.extractTextFromElement(element, this.getSelectors('price.max'));
    const priceMin = this.parseFloat(priceMinText) ?? 0;
    const priceMax = this.parseFloat(priceMaxText) ?? priceMin;

    // Extract unit sold
    const unitSoldText = await this.extractTextFromElement(element, this.getSelectors('unit_sold'));
    const unitSold = this.parseCount(unitSoldText);

    // Extract rating
    const ratingText = await this.extractTextFromElement(element, this.getSelectors('rating'));
    const rating = this.parseFloat(ratingText) ?? 0;

    // Extract review count
    const reviewCountText = await this.extractTextFromElement(element, this.getSelectors('review_count'));
    const reviewCount = this.parseInt(reviewCountText) ?? 0;

    // Extract shop info
    const shopNameText = await this.extractTextFromElement(element, this.getSelectors('shop_name'));
    const shopIdLink = await element.$('a[href*="/shop/"]');
    const shopHref = shopIdLink ? await shopIdLink.getAttribute('href') : null;
    const shopId = shopHref ? this.parsePattern(shopHref, '/shop/(\\d+)') : null;

    // Calculate GMV
    const gmv = unitSold && priceMin ? unitSold * priceMin : null;

    // Build product URL
    const pdpUrl = `https://shop.tiktok.com/product/${productId}`;

    // Track fields
    this.context.trackField('product_id', productId);
    this.context.trackField('product_name', productName);
    this.context.trackField('price', priceMin);
    this.context.trackField('unit_sold', unitSold);
    this.context.trackField('rating', rating);
    this.context.trackField('review_count', reviewCount);

    const product: BestsellerProduct = {
      product_id: productId,
      product_name: productName,
      category_path: categoryPath,
      period_days: periodDays,
      sales_rank: rank,
      unit_sold: unitSold,
      gmv,
      growth_rate_wow: null, // Requires historical data
      price: {
        min: priceMin,
        max: priceMax,
        currency: 'USD',
      },
      rating,
      review_count: reviewCount,
      avg_sentiment_score: null, // Requires review analysis
      is_declining: false, // Calculated later
      is_opportunity: false, // Calculated later
      pdp_url: pdpUrl,
      shop_id: shopId,
      shop_name: shopNameText,
    };

    return product;
  }

  private async extractTextFromElement(
    element: Awaited<ReturnType<Page['$']>>,
    selectors: string[],
  ): Promise<string | null> {
    if (!element) return null;

    for (const s of selectors) {
      try {
        const el = await element.$(s);
        if (el) {
          const text = await el.textContent();
          if (text) return text.trim();
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
