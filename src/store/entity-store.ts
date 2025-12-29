/**
 * In-memory entity store with deduplication
 */

import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import type {
  BestsellerProduct,
  ProductDetail,
  Review,
  Creator,
  Video,
  Edge,
  Entities,
} from '../schemas/entities.js';

type EntityType = 'product' | 'product_detail' | 'review' | 'creator' | 'video' | 'edge' | 'bestseller' | 'search_result';

function generateReviewId(review: Partial<Review>): string {
  const input = `${review.product_id}-${review.author?.display_name ?? 'anon'}-${review.text?.slice(0, 50) ?? ''}-${review.rating}`;
  return createHash('md5').update(input).digest('hex').slice(0, 16);
}

function generateEdgeId(edge: Edge): string {
  return `${edge.from_type}:${edge.from_id}-${edge.edge_type}-${edge.to_type}:${edge.to_id}`;
}

export class EntityStore {
  private products: Map<string, BestsellerProduct> = new Map();
  private productDetails: Map<string, ProductDetail> = new Map();
  private reviews: Map<string, Review> = new Map();
  private creators: Map<string, Creator> = new Map();
  private videos: Map<string, Video> = new Map();
  private edges: Map<string, Edge> = new Map();
  private bestsellers: Map<string, BestsellerProduct> = new Map();
  private searchResults: Map<string, BestsellerProduct> = new Map();

  private duplicateCounts: Record<EntityType, number> = {
    product: 0,
    product_detail: 0,
    review: 0,
    creator: 0,
    video: 0,
    edge: 0,
    bestseller: 0,
    search_result: 0,
  };

  // Generic add method for tools
  add(type: EntityType | string, id: string, entity: unknown): boolean {
    switch (type) {
      case 'bestseller':
        return this.addBestseller(entity as BestsellerProduct);
      case 'product':
        return this.addProduct(entity as BestsellerProduct);
      case 'product_detail':
        return this.addProductDetail(entity as ProductDetail);
      case 'review':
        return this.addReview(entity as Review);
      case 'creator':
        return this.addCreator(entity as Creator);
      case 'video':
        return this.addVideo(entity as Video);
      case 'edge':
        return this.addEdgeById(id, entity as Edge);
      case 'search_result':
        return this.addSearchResult(entity as BestsellerProduct);
      default:
        logger.warn({ type, id }, 'Unknown entity type');
        return false;
    }
  }

  // Generic get method for tools
  get(type: EntityType | string, id: string): unknown | undefined {
    switch (type) {
      case 'bestseller':
        return this.bestsellers.get(id);
      case 'product':
        return this.products.get(id);
      case 'product_detail':
        return this.productDetails.get(id);
      case 'review':
        return this.reviews.get(id);
      case 'creator':
        return this.creators.get(id);
      case 'video':
        return this.videos.get(id);
      case 'edge':
        return this.edges.get(id);
      case 'search_result':
        return this.searchResults.get(id);
      default:
        return undefined;
    }
  }

  // Count by type
  count(type: EntityType | string): number {
    switch (type) {
      case 'bestseller':
        return this.bestsellers.size;
      case 'product':
        return this.products.size;
      case 'product_detail':
        return this.productDetails.size;
      case 'review':
        return this.reviews.size;
      case 'creator':
        return this.creators.size;
      case 'video':
        return this.videos.size;
      case 'edge':
        return this.edges.size;
      case 'search_result':
        return this.searchResults.size;
      default:
        return 0;
    }
  }

  // Total count of all entities
  totalCount(): number {
    return (
      this.products.size +
      this.productDetails.size +
      this.reviews.size +
      this.creators.size +
      this.videos.size +
      this.edges.size +
      this.bestsellers.size +
      this.searchResults.size
    );
  }

  // Bestseller products
  addBestseller(product: BestsellerProduct): boolean {
    if (this.bestsellers.has(product.product_id)) {
      this.duplicateCounts.bestseller++;
      const existing = this.bestsellers.get(product.product_id)!;
      this.bestsellers.set(product.product_id, { ...existing, ...product });
      return false;
    }
    this.bestsellers.set(product.product_id, product);
    return true;
  }

  // Search result products
  addSearchResult(product: BestsellerProduct): boolean {
    if (this.searchResults.has(product.product_id)) {
      this.duplicateCounts.search_result++;
      const existing = this.searchResults.get(product.product_id)!;
      this.searchResults.set(product.product_id, { ...existing, ...product });
      return false;
    }
    this.searchResults.set(product.product_id, product);
    return true;
  }

  // Edge by ID (for generic add)
  private addEdgeById(id: string, edge: Edge): boolean {
    if (this.edges.has(id)) {
      this.duplicateCounts.edge++;
      return false;
    }
    this.edges.set(id, edge);
    return true;
  }

  // Products
  addProduct(product: BestsellerProduct): boolean {
    if (this.products.has(product.product_id)) {
      this.duplicateCounts.product++;
      // Merge/update existing
      const existing = this.products.get(product.product_id)!;
      this.products.set(product.product_id, { ...existing, ...product });
      return false;
    }
    this.products.set(product.product_id, product);
    return true;
  }

  getProduct(productId: string): BestsellerProduct | undefined {
    return this.products.get(productId);
  }

  getAllProducts(): BestsellerProduct[] {
    return Array.from(this.products.values());
  }

  // Product Details
  addProductDetail(detail: ProductDetail): boolean {
    if (this.productDetails.has(detail.product_id)) {
      this.duplicateCounts.product_detail++;
      const existing = this.productDetails.get(detail.product_id)!;
      this.productDetails.set(detail.product_id, { ...existing, ...detail });
      return false;
    }
    this.productDetails.set(detail.product_id, detail);
    return true;
  }

  getProductDetail(productId: string): ProductDetail | undefined {
    return this.productDetails.get(productId);
  }

  getAllProductDetails(): ProductDetail[] {
    return Array.from(this.productDetails.values());
  }

  // Reviews
  addReview(review: Review): boolean {
    const reviewId = review.review_id || generateReviewId(review);
    const reviewWithId = { ...review, review_id: reviewId };

    if (this.reviews.has(reviewId)) {
      this.duplicateCounts.review++;
      return false;
    }
    this.reviews.set(reviewId, reviewWithId);
    return true;
  }

  getReview(reviewId: string): Review | undefined {
    return this.reviews.get(reviewId);
  }

  getReviewsByProduct(productId: string): Review[] {
    return Array.from(this.reviews.values()).filter((r) => r.product_id === productId);
  }

  getAllReviews(): Review[] {
    return Array.from(this.reviews.values());
  }

  // Creators
  addCreator(creator: Creator): boolean {
    if (this.creators.has(creator.creator_id)) {
      this.duplicateCounts.creator++;
      const existing = this.creators.get(creator.creator_id)!;
      this.creators.set(creator.creator_id, { ...existing, ...creator });
      return false;
    }
    this.creators.set(creator.creator_id, creator);
    return true;
  }

  getCreator(creatorId: string): Creator | undefined {
    return this.creators.get(creatorId);
  }

  getCreatorByHandle(handle: string): Creator | undefined {
    const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;
    return Array.from(this.creators.values()).find((c) => c.handle === normalizedHandle);
  }

  getAllCreators(): Creator[] {
    return Array.from(this.creators.values());
  }

  // Videos
  addVideo(video: Video): boolean {
    if (this.videos.has(video.video_id)) {
      this.duplicateCounts.video++;
      const existing = this.videos.get(video.video_id)!;
      this.videos.set(video.video_id, { ...existing, ...video });
      return false;
    }
    this.videos.set(video.video_id, video);
    return true;
  }

  getVideo(videoId: string): Video | undefined {
    return this.videos.get(videoId);
  }

  getVideosByCreator(creatorId: string): Video[] {
    return Array.from(this.videos.values()).filter((v) => v.creator_id === creatorId);
  }

  getAllVideos(): Video[] {
    return Array.from(this.videos.values());
  }

  // Edges
  addEdge(edge: Edge): boolean {
    const edgeId = generateEdgeId(edge);

    if (this.edges.has(edgeId)) {
      this.duplicateCounts.edge++;
      return false;
    }
    this.edges.set(edgeId, edge);
    return true;
  }

  getEdgesFrom(fromType: string, fromId: string): Edge[] {
    return Array.from(this.edges.values()).filter(
      (e) => e.from_type === fromType && e.from_id === fromId,
    );
  }

  getEdgesTo(toType: string, toId: string): Edge[] {
    return Array.from(this.edges.values()).filter(
      (e) => e.to_type === toType && e.to_id === toId,
    );
  }

  getAllEdges(): Edge[] {
    return Array.from(this.edges.values());
  }

  // Export all entities
  toEntities(): Entities {
    return {
      products: this.getAllProducts(),
      product_details: this.getAllProductDetails(),
      reviews: this.getAllReviews(),
      creators: this.getAllCreators(),
      videos: this.getAllVideos(),
      edges: this.getAllEdges(),
    };
  }

  // Get statistics
  getStats(): {
    counts: Record<EntityType, number>;
    duplicates: Record<EntityType, number>;
  } {
    return {
      counts: {
        product: this.products.size,
        product_detail: this.productDetails.size,
        review: this.reviews.size,
        creator: this.creators.size,
        video: this.videos.size,
        edge: this.edges.size,
        bestseller: this.bestsellers.size,
        search_result: this.searchResults.size,
      },
      duplicates: { ...this.duplicateCounts },
    };
  }

  getTotalDuplicates(): number {
    return Object.values(this.duplicateCounts).reduce((sum, count) => sum + count, 0);
  }

  // Clear all entities
  clear(): void {
    this.products.clear();
    this.productDetails.clear();
    this.reviews.clear();
    this.creators.clear();
    this.videos.clear();
    this.edges.clear();
    this.bestsellers.clear();
    this.searchResults.clear();

    this.duplicateCounts = {
      product: 0,
      product_detail: 0,
      review: 0,
      creator: 0,
      video: 0,
      edge: 0,
      bestseller: 0,
      search_result: 0,
    };

    logger.debug('Entity store cleared');
  }
}

// Singleton instance for global access
export const entityStore = new EntityStore();

// Factory function for creating isolated stores per run
export function createEntityStore(): EntityStore {
  return new EntityStore();
}
