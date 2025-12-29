/**
 * Video extractor (V1)
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { Video, VideoMetrics, TaggedProduct } from '../schemas/entities.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

type ContentType = 'VIDEO' | 'LIVE' | 'PRODUCT_CARD' | null;

export interface VideoExtractorInput {
  videoId?: string;
  includeTaggedProducts?: boolean;
}

export interface VideoExtractorOutput {
  video: Video;
  taggedProducts: TaggedProduct[];
}

export class VideoExtractor extends BaseExtractor<VideoExtractorInput, VideoExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'video', options);
  }

  async extract(input: VideoExtractorInput): Promise<VideoExtractorOutput> {
    const { includeTaggedProducts = true } = input;
    const now = new Date().toISOString();
    const url = this.page.url();

    // Wait for video container
    const containerSelector = await this.waitForAny(this.getSelectors('video_container'));
    if (!containerSelector) {
      this.log.warn('Video container not found');
    }

    // Extract video ID from URL
    let videoId = input.videoId;
    if (!videoId) {
      videoId = this.parsePattern(url, '/video/(\\d+)') ?? 'unknown';
    }

    // Creator ID
    const creatorId = await this.safeExtract(
      async () => {
        const link = await this.extractAttribute(['a[href*="/@"]'], 'href');
        return link ? this.parsePattern(link, '/@([^/?]+)') : null;
      },
      'creator_id',
      null,
    );

    // Title
    const title = await this.safeExtract(
      () => this.extractText(this.getSelectors('title')),
      'title',
      null,
    );

    // Description
    const description = await this.safeExtract(
      () => this.extractText(this.getSelectors('description')),
      'description',
      null,
    );

    // Published at
    let publishedAt: string | null = await this.extractAttribute(
      this.getSelectors('published_at'),
      'datetime',
    );
    if (!publishedAt) {
      // Try text version and parse
      const dateText = await this.extractText(this.getSelectors('published_at_text'));
      // For now, use current time as fallback
      publishedAt = now;
    }

    // Duration
    const durationText = await this.extractText(this.getSelectors('duration_seconds'));
    const durationSeconds = this.parseDuration(durationText);

    // Metrics
    const metrics = await this.extractMetrics();

    // Hashtags
    const hashtagElements = await this.page.$$(this.getSelectors('hashtags').join(', '));
    const hashtags: string[] = [];
    for (const el of hashtagElements) {
      const text = await el.textContent();
      if (text) {
        // Extract hashtag without #
        const tag = text.trim().replace(/^#/, '');
        if (tag) hashtags.push(tag);
      }
    }

    // Also extract from description
    if (description) {
      const descHashtags = description.match(/#(\w+)/g);
      if (descHashtags) {
        for (const tag of descHashtags) {
          const cleanTag = tag.replace('#', '');
          if (!hashtags.includes(cleanTag)) {
            hashtags.push(cleanTag);
          }
        }
      }
    }

    // Tagged products
    const taggedProducts: TaggedProduct[] = [];
    if (includeTaggedProducts) {
      const extracted = await this.extractTaggedProducts();
      taggedProducts.push(...extracted);
    }

    // Content type
    const contentType = await this.detectContentType();

    // Thumbnail
    const thumbnailUrl = await this.safeExtract(
      () => this.extractAttribute(this.getSelectors('thumbnail_url'), 'content'),
      'thumbnail_url',
      null,
    );

    this.context.recordTimestamp();

    const video: Video = {
      video_id: videoId,
      video_url: url,
      creator_id: creatorId,
      title,
      description,
      published_at: publishedAt,
      duration_seconds: durationSeconds,
      metrics,
      hashtags,
      tagged_products: taggedProducts.length > 0 ? taggedProducts : null,
      content_type: contentType,
      thumbnail_url: thumbnailUrl,
      collected_at: now,
    };

    return { video, taggedProducts };
  }

  private async extractMetrics(): Promise<VideoMetrics> {
    // Views
    const viewsText = await this.extractText(this.getSelectors('metrics.views'));
    const views = this.parseCount(viewsText) ?? 0;
    this.context.trackField('views', views);

    // Likes
    const likesText = await this.extractText(this.getSelectors('metrics.likes'));
    const likes = this.parseCount(likesText) ?? 0;
    this.context.trackField('likes', likes);

    // Comments
    const commentsText = await this.extractText(this.getSelectors('metrics.comments'));
    const comments = this.parseCount(commentsText) ?? 0;
    this.context.trackField('comments', comments);

    // Shares (may be null)
    const sharesText = await this.extractText(this.getSelectors('metrics.shares'));
    const shares = this.parseCount(sharesText);
    this.context.trackField('shares', shares);

    // Saves (may be null)
    const savesText = await this.extractText(this.getSelectors('metrics.saves'));
    const saves = this.parseCount(savesText);
    this.context.trackField('saves', saves);

    return {
      views,
      likes,
      comments,
      shares,
      saves,
    };
  }

  private async extractTaggedProducts(): Promise<TaggedProduct[]> {
    const products: TaggedProduct[] = [];

    // Check for tagged products container
    const containerSelector = await this.waitForAny(
      this.getSelectors('tagged_products_container'),
      3000,
    );
    if (!containerSelector) {
      return products;
    }

    // Find product tags
    const productSelectors = this.getSelectors('tagged_product');
    let productSelector = '';

    for (const s of productSelectors) {
      const count = await this.countElements(s);
      if (count > 0) {
        productSelector = s;
        break;
      }
    }

    if (!productSelector) {
      return products;
    }

    const elements = await this.page.$$(productSelector);

    for (const element of elements) {
      try {
        // Product ID
        const productLink = await element.$('a[href*="/product/"]');
        const href = productLink ? await productLink.getAttribute('href') : null;
        const productId = href ? this.parsePattern(href, '/product/(\\d+)') : null;

        if (!productId) continue;

        // Product name
        const nameSelectors = this.getSelectors('tagged_product_data.product_name');
        let productName = '';
        for (const s of nameSelectors) {
          const el = await element.$(s);
          if (el) {
            productName = (await el.textContent())?.trim() ?? '';
            if (productName) break;
          }
        }

        const productUrl = `https://shop.tiktok.com/product/${productId}`;

        products.push({
          product_id: productId,
          product_name: productName || `Product ${productId}`,
          product_url: productUrl,
        });
      } catch (error) {
        this.log.warn({ error }, 'Failed to extract tagged product');
      }
    }

    return products;
  }

  private async detectContentType(): Promise<ContentType> {
    // Check for live indicator
    const isLive = await this.elementExists(this.getSelectors('content_type.is_live'));
    if (isLive) {
      return 'LIVE';
    }

    // Check for product card indicator
    const isProductCard = await this.elementExists(this.getSelectors('content_type.is_product_card'));
    if (isProductCard) {
      return 'PRODUCT_CARD';
    }

    // Default to VIDEO if video element exists
    const hasVideo = await this.elementExists(['video', '[data-testid="video-player"]']);
    if (hasVideo) {
      return 'VIDEO';
    }

    return null;
  }

  private parseDuration(text: string | null): number | null {
    if (!text) return null;

    // Handle formats like "1:30", "01:30", "1:30:45"
    const parts = text.split(':').map((p) => parseInt(p, 10));

    if (parts.length === 2) {
      // MM:SS
      const [minutes, seconds] = parts;
      if (!isNaN(minutes!) && !isNaN(seconds!)) {
        return minutes! * 60 + seconds!;
      }
    } else if (parts.length === 3) {
      // HH:MM:SS
      const [hours, minutes, seconds] = parts;
      if (!isNaN(hours!) && !isNaN(minutes!) && !isNaN(seconds!)) {
        return hours! * 3600 + minutes! * 60 + seconds!;
      }
    }

    // Try plain number
    const num = parseInt(text, 10);
    return isNaN(num) ? null : num;
  }
}
