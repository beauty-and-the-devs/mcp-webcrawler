/**
 * Review extractor
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { Review, ReviewAuthor, ReviewSignals, MediaType } from '../schemas/entities.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';
import { createHash } from 'crypto';

export interface ReviewExtractorInput {
  productId: string;
  limit: number;
  analyzeSentiment?: boolean;
}

export interface ReviewExtractorOutput {
  reviews: Review[];
  totalCount: number;
}

export class ReviewExtractor extends BaseExtractor<ReviewExtractorInput, ReviewExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'review', options);
  }

  async extract(input: ReviewExtractorInput): Promise<ReviewExtractorOutput> {
    const { productId, limit, analyzeSentiment = true } = input;
    const reviews: Review[] = [];

    // Wait for reviews container
    const containerSelector = await this.waitForAny(this.getSelectors('reviews_container'));
    if (!containerSelector) {
      this.log.warn('Reviews container not found');
      return { reviews: [], totalCount: 0 };
    }

    // Get total count
    const totalText = await this.extractFromConfig('total_reviews');
    const totalCount = this.parseInt(totalText as string) ?? 0;

    // Scroll to load more reviews
    let loadedCount = await this.countElements(this.getSelectors('review_item'));
    while (loadedCount < limit) {
      const scrollCount = await this.scrollToLoad(3);
      if (scrollCount === 0) break;

      const newCount = await this.countElements(this.getSelectors('review_item'));
      if (newCount === loadedCount) break;
      loadedCount = newCount;
    }

    // Find review items
    const itemSelectors = this.getSelectors('review_item');
    let itemSelector = '';

    for (const s of itemSelectors) {
      const count = await this.countElements(s);
      if (count > 0) {
        itemSelector = s;
        break;
      }
    }

    if (!itemSelector) {
      this.log.warn('No review items found');
      return { reviews: [], totalCount };
    }

    const elements = await this.page.$$(itemSelector);
    this.log.info({ found: elements.length, requested: limit }, 'Found review items');

    for (let i = 0; i < Math.min(elements.length, limit); i++) {
      const element = elements[i]!;

      try {
        const review = await this.extractReview(element, productId, analyzeSentiment);
        if (review) {
          reviews.push(review);
          this.context.recordTimestamp();
        }
      } catch (error) {
        this.log.warn({ index: i, error }, 'Failed to extract review');
      }
    }

    return { reviews, totalCount: totalCount || reviews.length };
  }

  private async extractReview(
    element: Awaited<ReturnType<Page['$']>>,
    productId: string,
    analyzeSentiment: boolean,
  ): Promise<Review | null> {
    if (!element) return null;

    const now = new Date().toISOString();

    // Rating
    const ratingSelectors = this.getSelectors('rating');
    let ratingText = '';
    for (const s of ratingSelectors) {
      const el = await element.$(s);
      if (el) {
        // Try to count star elements or get text
        const stars = await element.$$('.star-filled, .star-active, [data-filled="true"]');
        if (stars.length > 0) {
          ratingText = String(stars.length);
        } else {
          ratingText = (await el.textContent())?.trim() ?? '';
        }
        if (ratingText) break;
      }
    }
    const rating = this.parseInt(ratingText) ?? 5;

    // Review text
    const textSelectors = this.getSelectors('text');
    let text = '';
    for (const s of textSelectors) {
      const el = await element.$(s);
      if (el) {
        text = (await el.textContent())?.trim() ?? '';
        if (text) break;
      }
    }

    // Author info
    const author = await this.extractAuthor(element);

    // Media
    const mediaImages = await this.extractMediaFromElement(element, 'media_images', 'src');
    const mediaVideos = await this.extractMediaFromElement(element, 'media_videos', 'src');
    const mediaUrls = [...mediaImages, ...mediaVideos];

    let mediaType: MediaType = 'TEXT_ONLY';
    if (mediaVideos.length > 0) {
      mediaType = 'WITH_VIDEO';
    } else if (mediaImages.length > 0) {
      mediaType = 'WITH_IMAGE';
    }

    // Option purchased
    const optionSelectors = this.getSelectors('option_purchased');
    let optionPurchased: string | null = null;
    for (const s of optionSelectors) {
      const el = await element.$(s);
      if (el) {
        optionPurchased = (await el.textContent())?.trim() ?? null;
        if (optionPurchased) break;
      }
    }

    // Helpful count
    const helpfulSelectors = this.getSelectors('helpful_count');
    let helpfulText = '';
    for (const s of helpfulSelectors) {
      const el = await element.$(s);
      if (el) {
        helpfulText = (await el.textContent())?.trim() ?? '';
        if (helpfulText) break;
      }
    }
    const helpfulCount = this.parseInt(helpfulText) ?? 0;

    // Created at
    const dateSelectors = this.getSelectors('created_at');
    let createdAt: string | null = null;
    for (const s of dateSelectors) {
      const el = await element.$(s);
      if (el) {
        createdAt = await el.getAttribute('datetime');
        if (createdAt) break;
      }
    }

    // Generate review ID
    const reviewId = this.generateReviewId(productId, author.display_name, text, rating);

    // Calculate signals
    const signals = this.calculateSignals(text, mediaType, author, analyzeSentiment, rating);

    // Track fields
    this.context.trackField('rating', rating);
    this.context.trackField('text', text);
    this.context.trackField('author', author.display_name);

    return {
      review_id: reviewId,
      product_id: productId,
      created_at: createdAt,
      rating,
      text,
      media_type: mediaType,
      media_urls: mediaUrls,
      author,
      option_purchased: optionPurchased,
      helpful_count: helpfulCount,
      signals,
      collected_at: now,
    };
  }

  private async extractAuthor(element: Awaited<ReturnType<Page['$']>>): Promise<ReviewAuthor> {
    if (!element) {
      return {
        user_id: null,
        display_name: 'Anonymous',
        is_anonymous: true,
        is_verified_buyer: false,
      };
    }

    // Display name
    const nameSelectors = this.getSelectors('author.display_name');
    let displayName = 'Anonymous';
    for (const s of nameSelectors) {
      const el = await element.$(s);
      if (el) {
        displayName = (await el.textContent())?.trim() || 'Anonymous';
        if (displayName !== 'Anonymous') break;
      }
    }

    // User ID
    const userIdSelectors = this.getSelectors('author.user_id');
    let userId: string | null = null;
    for (const s of userIdSelectors) {
      const el = await element.$(s);
      if (el) {
        userId = await el.getAttribute('data-user-id');
        if (userId) break;
      }
    }

    // Verified buyer
    const verifiedSelectors = this.getSelectors('author.is_verified_buyer');
    let isVerifiedBuyer = false;
    for (const s of verifiedSelectors) {
      const el = await element.$(s);
      if (el) {
        isVerifiedBuyer = true;
        break;
      }
    }

    const isAnonymous =
      displayName === 'Anonymous' ||
      displayName.includes('***') ||
      displayName.match(/^[a-z]\*+[a-z]$/i) !== null;

    return {
      user_id: userId,
      display_name: displayName,
      is_anonymous: isAnonymous,
      is_verified_buyer: isVerifiedBuyer,
    };
  }

  private async extractMediaFromElement(
    element: Awaited<ReturnType<Page['$']>>,
    selectorPath: string,
    attribute: string,
  ): Promise<string[]> {
    if (!element) return [];

    const selectors = this.getSelectors(selectorPath);
    const results: string[] = [];

    for (const s of selectors) {
      try {
        const elements = await element.$$(s);
        for (const el of elements) {
          const value = await el.getAttribute(attribute);
          if (value) results.push(value);
        }
      } catch {
        continue;
      }
    }

    return results;
  }

  private generateReviewId(
    productId: string,
    author: string,
    text: string,
    rating: number,
  ): string {
    const input = `${productId}-${author}-${text.slice(0, 50)}-${rating}`;
    return createHash('md5').update(input).digest('hex').slice(0, 16);
  }

  private calculateSignals(
    text: string,
    mediaType: MediaType,
    author: ReviewAuthor,
    analyzeSentiment: boolean,
    rating: number,
  ): ReviewSignals {
    const textLen = text.length;

    // Calculate reliability weight
    let reliabilityWeight = 1.0;

    // Media bonus
    if (mediaType === 'WITH_VIDEO') {
      reliabilityWeight *= 1.5;
    } else if (mediaType === 'WITH_IMAGE') {
      reliabilityWeight *= 1.5;
    }

    // Anonymous penalty
    if (author.is_anonymous) {
      reliabilityWeight *= 0.7;
    }

    // Short text penalty
    if (textLen < 5) {
      reliabilityWeight *= 0.5;
    }

    // Low quality detection
    const isSuspectedLowQuality =
      textLen < 5 ||
      text.match(/^[!.?]+$/) !== null ||
      text.match(/^[a-z]$/i) !== null;

    // Simple sentiment analysis (rule-based)
    let sentimentScore: number | null = null;
    const complaintKeywords: string[] = [];
    const praiseKeywords: string[] = [];

    if (analyzeSentiment && text.length > 0) {
      const lowerText = text.toLowerCase();

      // Positive keywords
      const positiveWords = [
        'love', 'great', 'amazing', 'excellent', 'perfect', 'best',
        'recommend', 'good', 'nice', 'wonderful', 'fantastic', 'awesome',
        'happy', 'satisfied', 'quality',
      ];

      // Negative keywords
      const negativeWords = [
        'bad', 'terrible', 'awful', 'hate', 'disappointed', 'waste',
        'broken', 'fake', 'poor', 'cheap', 'horrible', 'worst',
        'refund', 'return', 'scam', 'never',
      ];

      let positiveCount = 0;
      let negativeCount = 0;

      for (const word of positiveWords) {
        if (lowerText.includes(word)) {
          positiveCount++;
          praiseKeywords.push(word);
        }
      }

      for (const word of negativeWords) {
        if (lowerText.includes(word)) {
          negativeCount++;
          complaintKeywords.push(word);
        }
      }

      const total = positiveCount + negativeCount;
      if (total > 0) {
        sentimentScore = (positiveCount - negativeCount) / total;
      } else {
        // Use rating as fallback
        sentimentScore = (author.is_verified_buyer ? 1 : 0.8) * ((rating - 3) / 2);
      }
    }

    return {
      text_len: textLen,
      sentiment_score: sentimentScore,
      complaint_keywords: complaintKeywords.slice(0, 5),
      praise_keywords: praiseKeywords.slice(0, 5),
      is_suspected_low_quality: isSuspectedLowQuality,
      reliability_weight: Math.round(reliabilityWeight * 100) / 100,
    };
  }
}

// Re-export types
export type { MediaType };
