/**
 * Product Detail Page (PDP) extractor
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { ProductDetail, ProductOption, ShopInfo, ShippingInfo } from '../schemas/entities.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

export interface PDPExtractorInput {
  productId: string;
}

export interface PDPExtractorOutput {
  product: ProductDetail;
}

export class PDPExtractor extends BaseExtractor<PDPExtractorInput, PDPExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'pdp', options);
  }

  async extract(input: PDPExtractorInput): Promise<PDPExtractorOutput> {
    const { productId } = input;
    const now = new Date().toISOString();

    // Wait for page content
    const nameSelector = await this.waitForAny(this.getSelectors('product_name'));
    if (!nameSelector) {
      this.log.warn('Product name not found');
    }

    // Extract basic info
    const productName = await this.safeExtract(
      () => this.extractText(this.getSelectors('product_name')),
      'product_name',
      null,
    );

    const description = await this.safeExtract(
      () => this.extractText(this.getSelectors('description')),
      'description',
      null,
    );

    // Extract price
    const salePriceText = await this.extractText(this.getSelectors('price.sale_price'));
    const listPriceText = await this.extractText(this.getSelectors('price.list_price'));
    const discountText = await this.extractText(this.getSelectors('price.discount_rate'));

    const salePrice = this.parseFloat(salePriceText) ?? 0;
    const listPrice = this.parseFloat(listPriceText);
    const discountRate = this.parseInt(discountText);

    this.context.trackField('price', salePrice);

    // Extract rating and reviews
    const ratingText = await this.extractText(this.getSelectors('rating'));
    const reviewCountText = await this.extractText(this.getSelectors('review_count'));
    const soldCountText = await this.extractText(this.getSelectors('sold_count'));

    const rating = this.parseFloat(ratingText) ?? 0;
    const reviewCount = this.parseInt(reviewCountText) ?? 0;
    const soldCount = this.parseCount(soldCountText);

    this.context.trackField('rating', rating);
    this.context.trackField('review_count', reviewCount);
    this.context.trackField('sold_count', soldCount);

    // Extract options
    const options = await this.extractOptions();

    // Extract images
    const images = await this.extractAllAttributes(
      this.getSelectors('gallery_images'),
      'src',
    );
    const mainImage = await this.extractAttribute(this.getSelectors('main_image'), 'src');
    if (mainImage && !images.includes(mainImage)) {
      images.unshift(mainImage);
    }

    // Extract video
    const videoUrl = await this.extractAttribute(this.getSelectors('video_url'), 'src');

    // Extract shop info
    const shop = await this.extractShopInfo();

    // Extract shipping info
    const shipping = await this.extractShippingInfo();

    // Extract category path
    const breadcrumbText = await this.extractText(this.getSelectors('category_path'));
    const categoryPath = breadcrumbText
      ? breadcrumbText.split(/[>/]/).map((s) => s.trim()).filter(Boolean)
      : [];

    const product: ProductDetail = {
      product_id: productId,
      product_name: productName ?? '',
      description: description ?? undefined,
      category_path: categoryPath.length > 0 ? categoryPath : undefined,
      price: {
        sale_price: salePrice,
        list_price: listPrice ?? undefined,
        discount_rate: discountRate ?? undefined,
        currency: 'USD',
      },
      options,
      images,
      video_url: videoUrl,
      rating,
      review_count: reviewCount,
      sold_count: soldCount,
      shop,
      shipping,
      pdp_url: this.page.url(),
      collected_at: now,
    };

    this.context.recordTimestamp();

    return { product };
  }

  private async extractOptions(): Promise<ProductOption[]> {
    const options: ProductOption[] = [];

    const containerSelectors = this.getSelectors('options_container');
    const hasContainer = await this.elementExists(containerSelectors);

    if (!hasContainer) {
      return options;
    }

    // This is a simplified version - actual implementation would need
    // to handle the specific option structure of TikTok Shop
    const optionNameSelectors = this.getSelectors('option_name');
    const optionNames = await this.extractAllText(optionNameSelectors);

    for (let i = 0; i < optionNames.length; i++) {
      const name = optionNames[i]!;
      options.push({
        option_id: `opt_${i}`,
        name,
        values: [], // Would need more specific extraction
        price_modifier: undefined,
      });
    }

    return options;
  }

  private async extractShopInfo(): Promise<ShopInfo | null> {
    const shopNameText = await this.extractText(this.getSelectors('shop.shop_name'));
    if (!shopNameText) return null;

    const shopIdLink = await this.extractAttribute(this.getSelectors('shop.shop_id'), 'href');
    const shopId = shopIdLink ? this.parsePattern(shopIdLink, '/shop/(\\d+)') : null;

    const shopUrl = await this.extractAttribute(this.getSelectors('shop.shop_url'), 'href');
    const shopRatingText = await this.extractText(this.getSelectors('shop.shop_rating'));
    const followerText = await this.extractText(this.getSelectors('shop.follower_count'));

    return {
      shop_id: shopId ?? 'unknown',
      shop_name: shopNameText,
      shop_url: shopUrl ?? undefined,
      rating: this.parseFloat(shopRatingText) ?? undefined,
      follower_count: this.parseCount(followerText) ?? undefined,
    };
  }

  private async extractShippingInfo(): Promise<ShippingInfo | null> {
    const freeShipping = await this.elementExists(this.getSelectors('shipping.free_shipping'));
    const estimatedDaysText = await this.extractText(this.getSelectors('shipping.estimated_days'));
    const estimatedDays = this.parseInt(estimatedDaysText);

    if (!freeShipping && !estimatedDays) {
      return null;
    }

    return {
      free_shipping: freeShipping,
      estimated_days: estimatedDays ?? undefined,
    };
  }
}

// Re-export types
export type { ProductOption, ShopInfo, ShippingInfo };
