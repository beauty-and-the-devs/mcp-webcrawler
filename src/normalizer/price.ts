/**
 * Price parsing and normalization
 */

export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Parse a price string to a number
 * Examples:
 *   "$12.99" -> 12.99
 *   "$1,234.56" -> 1234.56
 *   "12.99" -> 12.99
 *   "USD 12.99" -> 12.99
 */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;

  // Remove currency symbols and whitespace
  const cleaned = text
    .replace(/[A-Z]{3}\s*/gi, '') // Remove currency codes like USD, EUR
    .replace(/[$€£¥₩]/g, '') // Remove currency symbols
    .replace(/\s/g, '') // Remove whitespace
    .trim();

  // Handle comma as thousands separator
  const normalized = cleaned.replace(/,/g, '');

  const num = parseFloat(normalized);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/**
 * Parse a price range string
 * Examples:
 *   "$10.99 - $15.99" -> { min: 10.99, max: 15.99 }
 *   "$10.99-$15.99" -> { min: 10.99, max: 15.99 }
 *   "$10.99" -> { min: 10.99, max: 10.99 }
 */
export function parsePriceRange(text: string | null | undefined): PriceRange | null {
  if (!text) return null;

  // Check for range pattern
  const rangeMatch = text.match(
    /[$€£¥₩]?\s*([\d,]+\.?\d*)\s*[-–—]\s*[$€£¥₩]?\s*([\d,]+\.?\d*)/
  );

  if (rangeMatch) {
    const min = parsePrice(rangeMatch[1]);
    const max = parsePrice(rangeMatch[2]);

    if (min !== null && max !== null) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  // Single price
  const price = parsePrice(text);
  if (price !== null) {
    return { min: price, max: price };
  }

  return null;
}

/**
 * Calculate discount rate
 */
export function calculateDiscountRate(
  listPrice: number | null | undefined,
  salePrice: number | null | undefined,
): number | null {
  if (!listPrice || !salePrice || listPrice <= 0) return null;
  if (salePrice >= listPrice) return 0;

  const rate = ((listPrice - salePrice) / listPrice) * 100;
  return Math.round(rate);
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price);
}

/**
 * Format price range for display
 */
export function formatPriceRange(range: PriceRange, currency = 'USD'): string {
  if (range.min === range.max) {
    return formatPrice(range.min, currency);
  }
  return `${formatPrice(range.min, currency)} - ${formatPrice(range.max, currency)}`;
}
