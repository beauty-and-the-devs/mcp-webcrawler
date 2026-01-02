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
    let products: SearchProduct[] = [];

    // Method 1: Try to extract from embedded JSON data (most reliable for TikTok)
    const jsonProducts = await this.extractFromJson(limit);
    if (jsonProducts.length > 0) {
      this.log.info({ found: jsonProducts.length }, 'Extracted products from JSON data');
      return { products: jsonProducts, totalCount: jsonProducts.length };
    }

    // Method 2: Fall back to DOM extraction
    this.log.info('JSON extraction failed, trying DOM selectors');

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

  private async extractFromJson(limit: number): Promise<SearchProduct[]> {
    const products: SearchProduct[] = [];

    try {
      // Extract JSON from script tags - TikTok embeds data in various script tags
      const jsonData = await this.page.evaluate(() => {
        // Try __UNIVERSAL_DATA_FOR_REHYDRATION__
        const universalScript = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (universalScript?.textContent) {
          try {
            return JSON.parse(universalScript.textContent);
          } catch {}
        }

        // Try SIGI_STATE
        const sigiScript = document.querySelector('script#SIGI_STATE');
        if (sigiScript?.textContent) {
          try {
            return JSON.parse(sigiScript.textContent);
          } catch {}
        }

        // Try __NEXT_DATA__
        const nextScript = document.querySelector('script#__NEXT_DATA__');
        if (nextScript?.textContent) {
          try {
            return JSON.parse(nextScript.textContent);
          } catch {}
        }

        // Try to find any script with product data
        const scripts = document.querySelectorAll('script[type="application/json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent || '');
            if (data.products || data.items || data.searchResult) {
              return data;
            }
          } catch {}
        }

        return null;
      });

      if (!jsonData) {
        this.log.debug('No JSON data found in page');
        return [];
      }

      // Parse TikTok's data structure - try multiple paths
      const productList = this.findProducts(jsonData);

      for (let i = 0; i < Math.min(productList.length, limit); i++) {
        const item = productList[i];
        const product = this.parseJsonProduct(item);
        if (product) {
          products.push(product);
          this.context.recordTimestamp();
        }
      }
    } catch (error) {
      this.log.warn({ error }, 'Failed to extract from JSON');
    }

    return products;
  }

  private findProducts(data: any): any[] {
    if (!data) return [];

    // Direct arrays
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.searchResult)) return data.searchResult;
    if (Array.isArray(data.data?.products)) return data.data.products;
    if (Array.isArray(data.data?.items)) return data.data.items;

    // TikTok specific paths
    if (data.__DEFAULT_SCOPE__) {
      const scope = data.__DEFAULT_SCOPE__;
      if (scope['webapp.search']?.products) return scope['webapp.search'].products;
      if (scope['shop.search']?.products) return scope['shop.search'].products;
    }

    // Recursive search for product arrays
    const searchPaths = ['ItemModule', 'SearchModule', 'ShopModule', 'ProductModule'];
    for (const path of searchPaths) {
      if (data[path]) {
        const items = Object.values(data[path]);
        if (items.length > 0 && typeof items[0] === 'object') {
          return items as any[];
        }
      }
    }

    // Search props.pageProps
    if (data.props?.pageProps?.products) return data.props.pageProps.products;
    if (data.props?.pageProps?.items) return data.props.pageProps.items;

    return [];
  }

  private parseJsonProduct(item: any): SearchProduct | null {
    if (!item) return null;

    // Try to extract product ID
    const productId = item.productId || item.product_id || item.id || item.itemId;
    if (!productId) return null;

    // Extract price
    const priceData = item.price || item.priceInfo || {};
    const priceMin = this.parseFloat(String(
      priceData.salePrice || priceData.price || priceData.min || priceData.current || item.salePrice || 0
    )) ?? 0;
    const priceMax = this.parseFloat(String(
      priceData.originalPrice || priceData.max || priceData.listPrice || priceMin
    )) ?? priceMin;

    // Track fields
    this.context.trackField('product_id', productId);
    this.context.trackField('product_name', item.title || item.name || item.productName);
    this.context.trackField('price', priceMin);
    this.context.trackField('rating', item.rating || item.score);

    return {
      product_id: String(productId),
      product_name: item.title || item.name || item.productName || '',
      price: {
        min: priceMin,
        max: priceMax,
        currency: 'USD',
      },
      rating: this.parseFloat(String(item.rating || item.score || 0)) ?? 0,
      review_count: this.parseInt(String(item.reviewCount || item.reviews || 0)) ?? 0,
      sold_count: this.parseCount(String(item.soldCount || item.sales || item.sold || '')),
      shop_name: item.shopName || item.sellerName || item.shop?.name || null,
      is_ad: item.isAd || item.sponsored || false,
      pdp_url: `https://www.tiktok.com/shop/product/${productId}`,
    };
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
