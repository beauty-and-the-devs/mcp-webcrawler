/**
 * Shop/Seller profile extractor
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

export interface ShopProfile {
  shop_id: string;
  shop_name: string;
  description: string | null;
  avatar_url: string | null;
  rating: number | null;
  follower_count: number | null;
  product_count: number | null;
  response_rate: number | null;
  ship_on_time: number | null;
  location: string | null;
  joined_at: string | null;
  shop_url: string;
  collected_at: string;
}

export interface ShopExtractorInput {
  shopId?: string;
  shopHandle?: string;
}

export interface ShopExtractorOutput {
  shop: ShopProfile;
}

export class ShopExtractor extends BaseExtractor<ShopExtractorInput, ShopExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'shop', options);
  }

  async extract(input: ShopExtractorInput): Promise<ShopExtractorOutput> {
    const now = new Date().toISOString();
    const url = this.page.url();

    // Extract shop ID from URL if not provided
    let shopId = input.shopId;
    if (!shopId) {
      shopId = this.parsePattern(url, '/shop/(\\d+)') ??
               this.parsePattern(url, '/@([^/?]+)') ??
               'unknown';
    }

    // Wait for shop profile to load
    const containerSelector = await this.waitForAny(this.getSelectors('shop_container'));
    if (!containerSelector) {
      this.log.warn('Shop container not found');
    }

    // Shop name
    const shopName = await this.safeExtract(
      () => this.extractText(this.getSelectors('shop_name')),
      'shop_name',
      null,
    );

    // Description
    const description = await this.safeExtract(
      () => this.extractText(this.getSelectors('description')),
      'description',
      null,
    );

    // Avatar
    const avatarUrl = await this.safeExtract(
      () => this.extractAttribute(this.getSelectors('avatar_url'), 'src'),
      'avatar_url',
      null,
    );

    // Rating
    const ratingText = await this.extractText(this.getSelectors('rating'));
    const rating = this.parseFloat(ratingText);
    this.context.trackField('rating', rating);

    // Follower count
    const followerText = await this.extractText(this.getSelectors('follower_count'));
    const followerCount = this.parseCount(followerText);
    this.context.trackField('follower_count', followerCount);

    // Product count
    const productCountText = await this.extractText(this.getSelectors('product_count'));
    const productCount = this.parseInt(productCountText);
    this.context.trackField('product_count', productCount);

    // Response rate
    const responseRateText = await this.extractText(this.getSelectors('response_rate'));
    const responseRate = this.parseInt(responseRateText);

    // Ship on time rate
    const shipOnTimeText = await this.extractText(this.getSelectors('ship_on_time'));
    const shipOnTime = this.parseInt(shipOnTimeText);

    // Location
    const location = await this.extractText(this.getSelectors('location'));

    // Joined date
    const joinedAt = await this.extractText(this.getSelectors('joined_at'));

    this.context.recordTimestamp();

    const shop: ShopProfile = {
      shop_id: shopId,
      shop_name: shopName ?? 'Unknown Shop',
      description,
      avatar_url: avatarUrl,
      rating,
      follower_count: followerCount,
      product_count: productCount,
      response_rate: responseRate,
      ship_on_time: shipOnTime,
      location,
      joined_at: joinedAt,
      shop_url: url,
      collected_at: now,
    };

    return { shop };
  }
}
