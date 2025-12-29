/**
 * Date normalizer tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRelativeDate,
  parseISODate,
  formatDate,
  formatRelative,
  nowISO,
} from '../../../src/normalizer/date.js';

describe('parseRelativeDate', () => {
  const referenceDate = new Date('2024-01-15T12:00:00Z');

  it('should parse "just now"', () => {
    const result = parseRelativeDate('just now', referenceDate);
    expect(result).toBe(referenceDate.toISOString());
  });

  it('should parse seconds ago', () => {
    const result = parseRelativeDate('30s ago', referenceDate);
    expect(result).toBe(referenceDate.toISOString());

    const result2 = parseRelativeDate('30 seconds ago', referenceDate);
    expect(result2).toBe(referenceDate.toISOString());
  });

  it('should parse minutes ago', () => {
    const result = parseRelativeDate('5 minutes ago', referenceDate);
    expect(result).toBe('2024-01-15T11:55:00.000Z');

    const result2 = parseRelativeDate('5m ago', referenceDate);
    expect(result2).toBe('2024-01-15T11:55:00.000Z');

    const result3 = parseRelativeDate('5 min ago', referenceDate);
    expect(result3).toBe('2024-01-15T11:55:00.000Z');
  });

  it('should parse hours ago', () => {
    const result = parseRelativeDate('3 hours ago', referenceDate);
    expect(result).toBe('2024-01-15T09:00:00.000Z');

    const result2 = parseRelativeDate('3h ago', referenceDate);
    expect(result2).toBe('2024-01-15T09:00:00.000Z');

    const result3 = parseRelativeDate('1 hour ago', referenceDate);
    expect(result3).toBe('2024-01-15T11:00:00.000Z');
  });

  it('should parse days ago', () => {
    const result = parseRelativeDate('2 days ago', referenceDate);
    expect(result).toBe('2024-01-13T12:00:00.000Z');

    const result2 = parseRelativeDate('2d ago', referenceDate);
    expect(result2).toBe('2024-01-13T12:00:00.000Z');

    const result3 = parseRelativeDate('1 day ago', referenceDate);
    expect(result3).toBe('2024-01-14T12:00:00.000Z');
  });

  it('should parse weeks ago', () => {
    const result = parseRelativeDate('1 week ago', referenceDate);
    expect(result).toBe('2024-01-08T12:00:00.000Z');

    const result2 = parseRelativeDate('2 weeks ago', referenceDate);
    expect(result2).toBe('2024-01-01T12:00:00.000Z');

    const result3 = parseRelativeDate('2w ago', referenceDate);
    expect(result3).toBe('2024-01-01T12:00:00.000Z');
  });

  it('should parse months ago', () => {
    const result = parseRelativeDate('1 month ago', referenceDate);
    expect(result).toBe('2023-12-15T12:00:00.000Z');

    const result2 = parseRelativeDate('2 months ago', referenceDate);
    expect(result2).toBe('2023-11-15T12:00:00.000Z');
  });

  it('should parse "yesterday"', () => {
    const result = parseRelativeDate('yesterday', referenceDate);
    expect(result).toBe('2024-01-14T12:00:00.000Z');
  });

  it('should parse ISO 8601 dates', () => {
    // Date-only strings are parsed as local time by date-fns, so we check the date component
    const result = parseRelativeDate('2024-01-10', referenceDate);
    expect(result).not.toBeNull();
    expect(result!.startsWith('2024-01-')).toBe(true);

    // Full ISO timestamp with timezone should be exact
    const result2 = parseRelativeDate('2024-01-10T15:30:00Z', referenceDate);
    expect(result2).toBe('2024-01-10T15:30:00.000Z');
  });

  it('should return null for invalid input', () => {
    expect(parseRelativeDate(null)).toBeNull();
    expect(parseRelativeDate(undefined)).toBeNull();
    expect(parseRelativeDate('')).toBeNull();
    expect(parseRelativeDate('invalid date')).toBeNull();
  });

  it('should be case insensitive', () => {
    const result = parseRelativeDate('JUST NOW', referenceDate);
    expect(result).toBe(referenceDate.toISOString());

    const result2 = parseRelativeDate('5 MINUTES AGO', referenceDate);
    expect(result2).toBe('2024-01-15T11:55:00.000Z');
  });
});

describe('parseISODate', () => {
  it('should parse valid ISO dates', () => {
    const result = parseISODate('2024-01-15T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should parse date-only ISO format', () => {
    const result = parseISODate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
  });

  it('should return null for invalid input', () => {
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
    expect(parseISODate('')).toBeNull();
    expect(parseISODate('not a date')).toBeNull();
  });
});

describe('formatDate', () => {
  it('should format date with default format', () => {
    const result = formatDate(new Date('2024-01-15T12:00:00Z'));
    expect(result).toBe('2024-01-15');
  });

  it('should format date with custom format', () => {
    const result = formatDate(new Date('2024-01-15T12:00:00Z'), 'MMM d, yyyy');
    expect(result).toBe('Jan 15, 2024');
  });

  it('should accept ISO string', () => {
    const result = formatDate('2024-01-15T12:00:00Z');
    expect(result).toBe('2024-01-15');
  });
});

describe('formatRelative', () => {
  it('should return formatted relative time', () => {
    // This test depends on current time, so we just check it returns a string
    const result = formatRelative(new Date());
    expect(typeof result).toBe('string');
  });
});

describe('nowISO', () => {
  it('should return current time in ISO format', () => {
    const result = nowISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
