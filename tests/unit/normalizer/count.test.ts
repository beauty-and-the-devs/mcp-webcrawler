/**
 * Count normalizer tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseCount,
  parseInteger,
  formatCount,
  formatCountFull,
} from '../../../src/normalizer/count.js';

describe('parseCount', () => {
  it('should parse simple numbers', () => {
    expect(parseCount('100')).toBe(100);
    expect(parseCount('1234')).toBe(1234);
    expect(parseCount('0')).toBe(0);
  });

  it('should parse numbers with K suffix', () => {
    expect(parseCount('2.3K')).toBe(2300);
    expect(parseCount('2.3k')).toBe(2300);
    expect(parseCount('10K')).toBe(10000);
    expect(parseCount('1.5K')).toBe(1500);
  });

  it('should parse numbers with M suffix', () => {
    expect(parseCount('1.5M')).toBe(1500000);
    expect(parseCount('1.5m')).toBe(1500000);
    expect(parseCount('10M')).toBe(10000000);
    expect(parseCount('2.34M')).toBe(2340000);
  });

  it('should parse numbers with B suffix', () => {
    expect(parseCount('1.2B')).toBe(1200000000);
    expect(parseCount('1.2b')).toBe(1200000000);
    expect(parseCount('2B')).toBe(2000000000);
  });

  it('should remove common suffixes', () => {
    expect(parseCount('2.3K sold')).toBe(2300);
    expect(parseCount('1.5M views')).toBe(1500000);
    expect(parseCount('100 likes')).toBe(100);
    expect(parseCount('500 comments')).toBe(500);
    expect(parseCount('1K shares')).toBe(1000);
    expect(parseCount('10K followers')).toBe(10000);
  });

  it('should handle numbers with commas', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('1,234,567')).toBe(1234567);
  });

  it('should handle whitespace', () => {
    expect(parseCount('  2.3K  ')).toBe(2300);
    expect(parseCount('2.3 K')).toBe(2300);
  });

  it('should return null for invalid input', () => {
    expect(parseCount(null)).toBeNull();
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('')).toBeNull();
    expect(parseCount('N/A')).toBeNull();
    expect(parseCount('many')).toBeNull();
  });
});

describe('parseInteger', () => {
  it('should parse simple integers', () => {
    expect(parseInteger('123')).toBe(123);
    expect(parseInteger('0')).toBe(0);
    expect(parseInteger('-123')).toBe(-123);
  });

  it('should parse integers with commas', () => {
    expect(parseInteger('1,234')).toBe(1234);
    expect(parseInteger('1,234,567')).toBe(1234567);
  });

  it('should parse integers in parentheses', () => {
    expect(parseInteger('(123)')).toBe(123);
    expect(parseInteger('(1,234)')).toBe(1234);
  });

  it('should return null for invalid input', () => {
    expect(parseInteger(null)).toBeNull();
    expect(parseInteger(undefined)).toBeNull();
    expect(parseInteger('')).toBeNull();
    expect(parseInteger('abc')).toBeNull();
  });
});

describe('formatCount', () => {
  it('should format small numbers as-is', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(100)).toBe('100');
    expect(formatCount(999)).toBe('999');
  });

  it('should format thousands with K suffix', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(12345)).toBe('12.3K');
    expect(formatCount(999999)).toBe('1000.0K');
  });

  it('should format millions with M suffix', () => {
    expect(formatCount(1000000)).toBe('1.0M');
    expect(formatCount(1500000)).toBe('1.5M');
    expect(formatCount(12345678)).toBe('12.3M');
  });

  it('should format billions with B suffix', () => {
    expect(formatCount(1000000000)).toBe('1.0B');
    expect(formatCount(1500000000)).toBe('1.5B');
    expect(formatCount(12345678901)).toBe('12.3B');
  });
});

describe('formatCountFull', () => {
  it('should format with full number with commas', () => {
    expect(formatCountFull(1234)).toBe('1,234');
    expect(formatCountFull(1234567)).toBe('1,234,567');
    expect(formatCountFull(1234567890)).toBe('1,234,567,890');
  });
});
