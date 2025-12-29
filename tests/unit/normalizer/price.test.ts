/**
 * Price normalizer tests
 */

import { describe, it, expect } from 'vitest';
import {
  parsePrice,
  parsePriceRange,
  calculateDiscountRate,
  formatPrice,
  formatPriceRange,
} from '../../../src/normalizer/price.js';

describe('parsePrice', () => {
  it('should parse simple price with dollar sign', () => {
    expect(parsePrice('$12.99')).toBe(12.99);
    expect(parsePrice('$0.99')).toBe(0.99);
    expect(parsePrice('$100')).toBe(100);
  });

  it('should parse price with commas as thousands separator', () => {
    expect(parsePrice('$1,234.56')).toBe(1234.56);
    expect(parsePrice('$10,000')).toBe(10000);
    expect(parsePrice('$1,234,567.89')).toBe(1234567.89);
  });

  it('should parse price without currency symbol', () => {
    expect(parsePrice('12.99')).toBe(12.99);
    expect(parsePrice('100')).toBe(100);
  });

  it('should parse price with currency codes', () => {
    expect(parsePrice('USD 12.99')).toBe(12.99);
    expect(parsePrice('EUR 25.00')).toBe(25);
  });

  it('should parse price with different currency symbols', () => {
    expect(parsePrice('€25.99')).toBe(25.99);
    expect(parsePrice('£19.99')).toBe(19.99);
    expect(parsePrice('¥1000')).toBe(1000);
    expect(parsePrice('₩15000')).toBe(15000);
  });

  it('should handle whitespace', () => {
    expect(parsePrice('  $12.99  ')).toBe(12.99);
    expect(parsePrice('$ 12.99')).toBe(12.99);
  });

  it('should return null for invalid input', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('free')).toBeNull();
    expect(parsePrice('N/A')).toBeNull();
  });

  it('should round to 2 decimal places', () => {
    expect(parsePrice('$12.999')).toBe(13);
    expect(parsePrice('$12.994')).toBe(12.99);
  });
});

describe('parsePriceRange', () => {
  it('should parse price range with dash', () => {
    const result = parsePriceRange('$10.99 - $15.99');
    expect(result).toEqual({ min: 10.99, max: 15.99 });
  });

  it('should parse price range without spaces', () => {
    const result = parsePriceRange('$10.99-$15.99');
    expect(result).toEqual({ min: 10.99, max: 15.99 });
  });

  it('should parse price range with en-dash', () => {
    const result = parsePriceRange('$10.99–$15.99');
    expect(result).toEqual({ min: 10.99, max: 15.99 });
  });

  it('should handle reversed order', () => {
    const result = parsePriceRange('$20.99 - $10.99');
    expect(result).toEqual({ min: 10.99, max: 20.99 });
  });

  it('should parse single price as range', () => {
    const result = parsePriceRange('$12.99');
    expect(result).toEqual({ min: 12.99, max: 12.99 });
  });

  it('should return null for invalid input', () => {
    expect(parsePriceRange(null)).toBeNull();
    expect(parsePriceRange(undefined)).toBeNull();
    expect(parsePriceRange('')).toBeNull();
  });
});

describe('calculateDiscountRate', () => {
  it('should calculate correct discount rate', () => {
    expect(calculateDiscountRate(100, 80)).toBe(20);
    expect(calculateDiscountRate(50, 25)).toBe(50);
    expect(calculateDiscountRate(99.99, 79.99)).toBe(20);
  });

  it('should return 0 when sale price equals list price', () => {
    expect(calculateDiscountRate(100, 100)).toBe(0);
  });

  it('should return 0 when sale price is higher than list price', () => {
    expect(calculateDiscountRate(80, 100)).toBe(0);
  });

  it('should return null for invalid input', () => {
    expect(calculateDiscountRate(null, 80)).toBeNull();
    expect(calculateDiscountRate(100, null)).toBeNull();
    expect(calculateDiscountRate(0, 80)).toBeNull();
    expect(calculateDiscountRate(-100, 80)).toBeNull();
  });
});

describe('formatPrice', () => {
  it('should format price with default currency', () => {
    expect(formatPrice(12.99)).toBe('$12.99');
    expect(formatPrice(1234.56)).toBe('$1,234.56');
  });

  it('should format price with specified currency', () => {
    expect(formatPrice(12.99, 'EUR')).toMatch(/12[.,]99/);
    expect(formatPrice(12.99, 'GBP')).toMatch(/12[.,]99/);
  });
});

describe('formatPriceRange', () => {
  it('should format single price range', () => {
    expect(formatPriceRange({ min: 12.99, max: 12.99 })).toBe('$12.99');
  });

  it('should format price range', () => {
    expect(formatPriceRange({ min: 10.99, max: 15.99 })).toBe('$10.99 - $15.99');
  });
});
