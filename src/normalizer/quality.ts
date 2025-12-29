/**
 * Quality report generation
 */

import type { QualityReport, QualityError } from '../schemas/entities.js';

export class QualityReporter {
  private errors: QualityError[] = [];
  private fieldCounts: Record<string, { total: number; filled: number }> = {};
  private duplicateCount = 0;
  private timestamps: Date[] = [];

  /**
   * Track a field extraction
   */
  trackField(fieldName: string, value: unknown): void {
    if (!this.fieldCounts[fieldName]) {
      this.fieldCounts[fieldName] = { total: 0, filled: 0 };
    }

    this.fieldCounts[fieldName].total++;

    if (value !== null && value !== undefined && value !== '') {
      this.fieldCounts[fieldName].filled++;
    }
  }

  /**
   * Track multiple fields at once
   */
  trackFields(fields: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(fields)) {
      this.trackField(name, value);
    }
  }

  /**
   * Add an error
   */
  addError(error: Partial<QualityError> & { error_code: string; message: string }): void {
    this.errors.push(error as QualityError);
  }

  /**
   * Increment duplicate count
   */
  incrementDuplicates(count = 1): void {
    this.duplicateCount += count;
  }

  /**
   * Record a timestamp for freshness tracking
   */
  recordTimestamp(date?: Date): void {
    this.timestamps.push(date ?? new Date());
  }

  /**
   * Generate the quality report
   */
  generate(): QualityReport {
    const fieldFillRate: Record<string, number> = {};
    let totalFields = 0;
    let filledFields = 0;

    for (const [field, counts] of Object.entries(this.fieldCounts)) {
      const rate = counts.total > 0 ? counts.filled / counts.total : 0;
      fieldFillRate[field] = Math.round(rate * 100) / 100;
      totalFields += counts.total;
      filledFields += counts.filled;
    }

    const parseSuccessRate = totalFields > 0
      ? Math.round((filledFields / totalFields) * 100) / 100
      : 1;

    // Check for blocked indicators
    const blockedSuspected = this.errors.some(
      (e) =>
        e.error_code === 'BLOCKED' ||
        e.message?.toLowerCase().includes('captcha') ||
        e.message?.toLowerCase().includes('blocked') ||
        e.message?.toLowerCase().includes('access denied'),
    );

    // Calculate freshness
    let freshness: { oldest: string; newest: string } | undefined;
    if (this.timestamps.length > 0) {
      const sorted = [...this.timestamps].sort((a, b) => a.getTime() - b.getTime());
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

  /**
   * Reset the reporter
   */
  reset(): void {
    this.errors = [];
    this.fieldCounts = {};
    this.duplicateCount = 0;
    this.timestamps = [];
  }

  /**
   * Get current error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Check if any critical errors occurred
   */
  hasCriticalErrors(): boolean {
    return this.errors.some(
      (e) => e.error_code === 'BLOCKED' || e.error_code === 'TIMEOUT',
    );
  }
}

/**
 * Merge multiple quality reports
 */
export function mergeQualityReports(reports: QualityReport[]): QualityReport {
  if (reports.length === 0) {
    return {
      parse_success_rate: 1,
      field_fill_rate: {},
      duplicate_count: 0,
      errors: [],
      blocked_suspected: false,
    };
  }

  if (reports.length === 1) {
    return reports[0]!;
  }

  // Merge field fill rates
  const mergedFieldFillRate: Record<string, number[]> = {};
  for (const report of reports) {
    for (const [field, rate] of Object.entries(report.field_fill_rate)) {
      if (!mergedFieldFillRate[field]) {
        mergedFieldFillRate[field] = [];
      }
      mergedFieldFillRate[field].push(rate);
    }
  }

  const fieldFillRate: Record<string, number> = {};
  for (const [field, rates] of Object.entries(mergedFieldFillRate)) {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    fieldFillRate[field] = Math.round(avg * 100) / 100;
  }

  // Average parse success rate
  const parseSuccessRate =
    reports.reduce((a, r) => a + r.parse_success_rate, 0) / reports.length;

  // Sum duplicates
  const duplicateCount = reports.reduce((a, r) => a + r.duplicate_count, 0);

  // Combine errors
  const errors = reports.flatMap((r) => r.errors);

  // Any blocked
  const blockedSuspected = reports.some((r) => r.blocked_suspected);

  // Freshness from all timestamps
  const allTimestamps: Date[] = [];
  for (const report of reports) {
    if (report.freshness) {
      allTimestamps.push(new Date(report.freshness.oldest));
      allTimestamps.push(new Date(report.freshness.newest));
    }
  }

  let freshness: { oldest: string; newest: string } | undefined;
  if (allTimestamps.length > 0) {
    const sorted = allTimestamps.sort((a, b) => a.getTime() - b.getTime());
    freshness = {
      oldest: sorted[0]!.toISOString(),
      newest: sorted[sorted.length - 1]!.toISOString(),
    };
  }

  return {
    parse_success_rate: Math.round(parseSuccessRate * 100) / 100,
    field_fill_rate: fieldFillRate,
    duplicate_count: duplicateCount,
    errors,
    blocked_suspected: blockedSuspected,
    freshness,
  };
}

/**
 * Create an empty quality report
 */
export function emptyQualityReport(): QualityReport {
  return {
    parse_success_rate: 1,
    field_fill_rate: {},
    duplicate_count: 0,
    errors: [],
    blocked_suspected: false,
  };
}
