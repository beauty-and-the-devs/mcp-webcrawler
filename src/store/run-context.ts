/**
 * Run context management for crawl sessions
 */

import { v4 as uuidv4 } from 'uuid';
import type { QualityReport, QualityError } from '../schemas/entities.js';

export type EntrypointType =
  | 'category_bestseller'
  | 'search'
  | 'product_pdp'
  | 'reviews'
  | 'creator'
  | 'video';

export type CrawlStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Entrypoint {
  type: EntrypointType;
  params: Record<string, unknown>;
}

export interface RunContextData {
  run_id: string;
  started_at: string;
  ended_at?: string;
  market: string;
  locale: string;
  timezone: string;
  entrypoint: Entrypoint;
  crawler_version: string;
  parser_version?: string;
  status: CrawlStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  error_message?: string;
}

export interface CreateRunContextOptions {
  entrypoint: Entrypoint;
  market?: string;
  locale?: string;
  timezone?: string;
}

const CRAWLER_VERSION = '1.0.0';

export class RunContext {
  readonly runId: string;
  readonly startedAt: string;
  readonly toolName: string;
  private endedAt?: Date;
  readonly market: string;
  readonly locale: string;
  readonly timezone: string;
  readonly entrypoint?: Entrypoint;
  status: CrawlStatus = 'running';
  private progress = { total: 0, completed: 0, failed: 0 };
  private errorMessage?: string;

  // Quality tracking
  private errors: QualityError[] = [];
  private fieldCounts: Record<string, { total: number; filled: number }> = {};
  duplicateCount = 0;
  private timestamps: Date[] = [];

  // Constructor overloads
  constructor(runId: string, toolName: string);
  constructor(options: CreateRunContextOptions);
  constructor(runIdOrOptions: string | CreateRunContextOptions, toolName?: string) {
    if (typeof runIdOrOptions === 'string') {
      // New simple constructor for tools
      this.runId = runIdOrOptions;
      this.toolName = toolName ?? 'unknown';
      this.startedAt = new Date().toISOString();
      this.market = 'US';
      this.locale = 'en-US';
      this.timezone = 'America/Los_Angeles';
      runContextStore.add(this);
    } else {
      // Original constructor with options
      this.runId = uuidv4();
      this.toolName = runIdOrOptions.entrypoint.type;
      this.startedAt = new Date().toISOString();
      this.market = runIdOrOptions.market ?? 'US';
      this.locale = runIdOrOptions.locale ?? 'en-US';
      this.timezone = runIdOrOptions.timezone ?? 'America/Los_Angeles';
      this.entrypoint = runIdOrOptions.entrypoint;
      runContextStore.add(this);
    }
  }

  // Progress management
  setTotal(total: number): void {
    this.progress.total = total;
  }

  incrementCompleted(): void {
    this.progress.completed++;
  }

  incrementFailed(): void {
    this.progress.failed++;
  }

  // Status management
  complete(): void {
    this.status = 'completed';
    this.endedAt = new Date();
  }

  fail(message: string): void {
    this.status = 'failed';
    this.errorMessage = message;
    this.endedAt = new Date();
  }

  cancel(): void {
    this.status = 'cancelled';
    this.endedAt = new Date();
  }

  // Quality tracking
  trackField(fieldName: string, value: unknown): void {
    if (!this.fieldCounts[fieldName]) {
      this.fieldCounts[fieldName] = { total: 0, filled: 0 };
    }

    this.fieldCounts[fieldName].total++;

    if (value !== null && value !== undefined && value !== '') {
      this.fieldCounts[fieldName].filled++;
    }
  }

  trackFields(fields: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(fields)) {
      this.trackField(name, value);
    }
  }

  addError(errorCodeOrError: string | (Omit<QualityError, 'url'> & { url?: string }), message?: string): void {
    if (typeof errorCodeOrError === 'string') {
      // Simple form: addError(code, message)
      this.errors.push({
        error_code: errorCodeOrError,
        message: message ?? errorCodeOrError,
      } as QualityError);
    } else {
      // Object form: addError(errorObj)
      this.errors.push(errorCodeOrError as QualityError);
    }
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  incrementDuplicates(): void {
    this.duplicateCount++;
  }

  recordTimestamp(date?: Date): void {
    this.timestamps.push(date ?? new Date());
  }

  // Generate quality report
  generateQualityReport(): QualityReport {
    const fieldFillRate: Record<string, number> = {};
    let totalFields = 0;
    let filledFields = 0;

    for (const [field, counts] of Object.entries(this.fieldCounts)) {
      fieldFillRate[field] = counts.total > 0 ? counts.filled / counts.total : 0;
      totalFields += counts.total;
      filledFields += counts.filled;
    }

    const parseSuccessRate = totalFields > 0 ? filledFields / totalFields : 1;

    // Check for blocked indicators
    const blockedSuspected = this.errors.some(
      (e) =>
        e.error_code === 'BLOCKED' ||
        e.message?.toLowerCase().includes('captcha') ||
        e.message?.toLowerCase().includes('blocked'),
    );

    // Calculate freshness
    let freshness: { oldest: string; newest: string } | undefined;
    if (this.timestamps.length > 0) {
      const sorted = this.timestamps.sort((a, b) => a.getTime() - b.getTime());
      freshness = {
        oldest: sorted[0]!.toISOString(),
        newest: sorted[sorted.length - 1]!.toISOString(),
      };
    }

    return {
      parse_success_rate: parseSuccessRate,
      field_fill_rate: fieldFillRate,
      duplicate_count: this.duplicateCount,
      errors: this.errors,
      blocked_suspected: blockedSuspected,
      freshness,
    };
  }

  // Export as serializable data
  toData(): RunContextData {
    return {
      run_id: this.runId,
      started_at: this.startedAt,
      ended_at: this.endedAt?.toISOString(),
      market: this.market,
      locale: this.locale,
      timezone: this.timezone,
      entrypoint: this.entrypoint!,
      crawler_version: CRAWLER_VERSION,
      status: this.status,
      progress: this.progress,
      error_message: this.errorMessage,
    };
  }

  // Export for output schema
  toRunContextOutput() {
    return {
      run_id: this.runId,
      started_at: this.startedAt,
      ended_at: this.endedAt?.toISOString(),
      market: this.market,
      locale: this.locale,
      timezone: this.timezone,
      entrypoint: this.entrypoint,
      crawler_version: CRAWLER_VERSION,
    };
  }

  getStatus(): CrawlStatus {
    return this.status;
  }

  getProgress() {
    return { ...this.progress };
  }

  getErrorMessage(): string | undefined {
    return this.errorMessage;
  }
}

// In-memory store for run contexts
class RunContextStore {
  private contexts: Map<string, RunContext> = new Map();

  add(context: RunContext): void {
    this.contexts.set(context.runId, context);
  }

  get(runId: string): RunContext | undefined {
    return this.contexts.get(runId);
  }

  remove(runId: string): boolean {
    return this.contexts.delete(runId);
  }

  list(): RunContext[] {
    return Array.from(this.contexts.values());
  }

  getRecent(count: number): RunContext[] {
    return Array.from(this.contexts.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, count);
  }

  // Cleanup old completed contexts (keep last N)
  cleanup(keepLast = 100): void {
    const contexts = this.list()
      .filter((c) => c.getStatus() !== 'running')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (contexts.length > keepLast) {
      for (const context of contexts.slice(keepLast)) {
        this.remove(context.runId);
      }
    }
  }
}

export const runContextStore = new RunContextStore();
