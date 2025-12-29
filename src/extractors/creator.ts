/**
 * Creator profile extractor (V1)
 */

import { BaseExtractor, type ExtractorOptions } from './base.js';
import type { Creator, CreatorPerformance, Video } from '../schemas/entities.js';
import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';

export interface CreatorExtractorInput {
  handle?: string;
  creatorId?: string;
  includeVideos?: boolean;
  videoLimit?: number;
}

export interface CreatorExtractorOutput {
  creator: Creator;
  videos: Partial<Video>[];
}

type CreatorType = 'SALES' | 'VIRAL' | 'UNKNOWN';

export class CreatorExtractor extends BaseExtractor<CreatorExtractorInput, CreatorExtractorOutput> {
  constructor(page: Page, context: RunContext, options?: ExtractorOptions) {
    super(page, context, 'creator', options);
  }

  async extract(input: CreatorExtractorInput): Promise<CreatorExtractorOutput> {
    const { includeVideos = true, videoLimit = 20 } = input;
    const now = new Date().toISOString();
    const url = this.page.url();

    // Wait for profile to load
    const containerSelector = await this.waitForAny(this.getSelectors('profile_container'));
    if (!containerSelector) {
      this.log.warn('Creator profile container not found');
    }

    // Extract handle from URL
    let handle = input.handle;
    if (!handle) {
      const urlHandle = this.parsePattern(url, '@([^/?]+)');
      handle = urlHandle ? `@${urlHandle}` : '@unknown';
    }
    if (!handle.startsWith('@')) {
      handle = `@${handle}`;
    }

    // Creator ID
    const creatorId = input.creatorId ??
      await this.extractAttribute(['[data-user-id]'], 'data-user-id') ??
      handle.slice(1);

    // Display name
    const displayName = await this.safeExtract(
      () => this.extractText(this.getSelectors('display_name')),
      'display_name',
      null,
    );

    // Bio
    const bio = await this.safeExtract(
      () => this.extractText(this.getSelectors('bio')),
      'bio',
      null,
    );

    // Avatar
    const avatarUrl = await this.safeExtract(
      () => this.extractAttribute(this.getSelectors('avatar_url'), 'src'),
      'avatar_url',
      null,
    );

    // Follower count
    const followerText = await this.extractText(this.getSelectors('follower_count'));
    const followerCount = this.parseCount(followerText) ?? 0;
    this.context.trackField('follower_count', followerCount);

    // Following count
    const followingText = await this.extractText(this.getSelectors('following_count'));
    const followingCount = this.parseCount(followingText);

    // Total likes
    const likesText = await this.extractText(this.getSelectors('total_likes'));
    const totalLikes = this.parseCount(likesText);

    // Video count
    const videoCountText = await this.extractText(this.getSelectors('video_count'));
    const videoCount = this.parseInt(videoCountText);

    // Primary categories (from bio or content)
    const categoriesText = await this.extractAllText(this.getSelectors('primary_categories'));
    const primaryCategories = categoriesText.length > 0 ? categoriesText : null;

    // Extract videos if requested
    const videos: Partial<Video>[] = [];
    let performance: CreatorPerformance;

    if (includeVideos) {
      const extractedVideos = await this.extractVideos(videoLimit);
      videos.push(...extractedVideos);
      performance = this.calculatePerformance(extractedVideos);
    } else {
      performance = this.getEmptyPerformance();
    }

    // Classify creator type
    const creatorType = this.classifyCreator(followerCount, performance);

    this.context.recordTimestamp();

    const creator: Creator = {
      creator_id: creatorId,
      handle,
      display_name: displayName ?? handle,
      bio,
      avatar_url: avatarUrl,
      follower_count: followerCount,
      following_count: followingCount,
      total_likes: totalLikes,
      video_count: videoCount,
      primary_categories: primaryCategories,
      performance,
      creator_type: creatorType,
      profile_url: url,
      collected_at: now,
    };

    return { creator, videos };
  }

  private async extractVideos(limit: number): Promise<Partial<Video>[]> {
    const videos: Partial<Video>[] = [];

    // Wait for video grid
    const gridSelector = await this.waitForAny(this.getSelectors('video_container'));
    if (!gridSelector) {
      return videos;
    }

    // Scroll to load videos
    let loadedCount = await this.countElements(this.getSelectors('video_item'));
    while (loadedCount < limit) {
      const scrollCount = await this.scrollToLoad(3);
      if (scrollCount === 0) break;

      const newCount = await this.countElements(this.getSelectors('video_item'));
      if (newCount === loadedCount) break;
      loadedCount = newCount;
    }

    // Find video items
    const itemSelectors = this.getSelectors('video_item');
    let itemSelector = '';

    for (const s of itemSelectors) {
      const count = await this.countElements(s);
      if (count > 0) {
        itemSelector = s;
        break;
      }
    }

    if (!itemSelector) {
      return videos;
    }

    const elements = await this.page.$$(itemSelector);

    for (let i = 0; i < Math.min(elements.length, limit); i++) {
      const element = elements[i]!;

      try {
        const video = await this.extractVideoPreview(element);
        if (video) {
          videos.push(video);
        }
      } catch (error) {
        this.log.warn({ index: i, error }, 'Failed to extract video preview');
      }
    }

    return videos;
  }

  private async extractVideoPreview(element: Awaited<ReturnType<Page['$']>>): Promise<Partial<Video> | null> {
    if (!element) return null;

    // Video ID from link
    const videoLink = await element.$('a[href*="/video/"]');
    const href = videoLink ? await videoLink.getAttribute('href') : null;
    const videoId = href ? this.parsePattern(href, '/video/(\\d+)') : null;

    if (!videoId) return null;

    // Views
    const viewsSelectors = this.getSelectors('video.views');
    let viewsText = '';
    for (const s of viewsSelectors) {
      const el = await element.$(s);
      if (el) {
        viewsText = (await el.textContent())?.trim() ?? '';
        if (viewsText) break;
      }
    }
    const views = this.parseCount(viewsText) ?? 0;

    // Likes
    const likesSelectors = this.getSelectors('video.likes');
    let likesText = '';
    for (const s of likesSelectors) {
      const el = await element.$(s);
      if (el) {
        likesText = (await el.textContent())?.trim() ?? '';
        if (likesText) break;
      }
    }
    const likes = this.parseCount(likesText) ?? 0;

    // Thumbnail
    const thumbnailSelectors = this.getSelectors('video.thumbnail');
    let thumbnailUrl: string | null = null;
    for (const s of thumbnailSelectors) {
      const el = await element.$(s);
      if (el) {
        thumbnailUrl = await el.getAttribute('src');
        if (thumbnailUrl) break;
      }
    }

    return {
      video_id: videoId,
      video_url: `https://www.tiktok.com/video/${videoId}`,
      metrics: {
        views,
        likes,
        comments: 0,
        shares: null,
        saves: null,
      },
      thumbnail_url: thumbnailUrl,
    };
  }

  private calculatePerformance(videos: Partial<Video>[]): CreatorPerformance {
    if (videos.length === 0) {
      return this.getEmptyPerformance();
    }

    const validVideos = videos.filter((v) => v.metrics);
    if (validVideos.length === 0) {
      return this.getEmptyPerformance();
    }

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    for (const video of validVideos) {
      totalViews += video.metrics?.views ?? 0;
      totalLikes += video.metrics?.likes ?? 0;
      totalComments += video.metrics?.comments ?? 0;
      totalShares += video.metrics?.shares ?? 0;
    }

    const avgViews = totalViews / validVideos.length;
    const avgLikes = totalLikes / validVideos.length;
    const avgComments = totalComments / validVideos.length;
    const avgShares = totalShares / validVideos.length;

    // Engagement rate: (likes + comments + shares) / views * 100
    let engagementRate: number | null = null;
    if (totalViews > 0) {
      engagementRate = ((totalLikes + totalComments + totalShares) / totalViews) * 100;
      engagementRate = Math.round(engagementRate * 100) / 100;
    }

    return {
      avg_views: Math.round(avgViews),
      avg_likes: Math.round(avgLikes),
      avg_comments: Math.round(avgComments),
      avg_shares: Math.round(avgShares),
      engagement_rate: engagementRate,
      upload_frequency_per_week: null, // Would need date analysis
      affiliate_gmv: null, // Always null (TikTok private)
    };
  }

  private getEmptyPerformance(): CreatorPerformance {
    return {
      avg_views: null,
      avg_likes: null,
      avg_comments: null,
      avg_shares: null,
      engagement_rate: null,
      upload_frequency_per_week: null,
      affiliate_gmv: null,
    };
  }

  private classifyCreator(followerCount: number, performance: CreatorPerformance): CreatorType {
    // SALES: followers < 100K AND engagement_rate >= 5%
    // VIRAL: followers >= 100K OR avg_views >= 50K
    // UNKNOWN: otherwise

    const engagementRate = performance.engagement_rate ?? 0;
    const avgViews = performance.avg_views ?? 0;

    if (followerCount >= 100000 || avgViews >= 50000) {
      return 'VIRAL';
    }

    if (followerCount < 100000 && engagementRate >= 5) {
      return 'SALES';
    }

    return 'UNKNOWN';
  }
}
