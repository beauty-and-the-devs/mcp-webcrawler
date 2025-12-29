/**
 * Count parsing and normalization
 * Handles K/M/B suffixes and various formats
 */

/**
 * Parse a count string to a number
 * Examples:
 *   "2.3K" -> 2300
 *   "1.5M" -> 1500000
 *   "1.2B" -> 1200000000
 *   "1,234" -> 1234
 *   "1234" -> 1234
 *   "2.3K sold" -> 2300
 *   "1.5M views" -> 1500000
 */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;

  // Remove common suffixes and clean up
  const cleaned = text
    .toLowerCase()
    .replace(/\s*(sold|views|likes|comments|shares|saves|followers|following)\s*/gi, '')
    .replace(/[,\s]/g, '')
    .trim();

  if (!cleaned) return null;

  // Match number with optional suffix
  const match = cleaned.match(/^([\d.]+)([kmb])?$/i);

  if (!match) return null;

  let num = Number.parseFloat(match[1]!);
  if (isNaN(num)) return null;

  const suffix = match[2]?.toLowerCase();

  switch (suffix) {
    case 'k':
      num *= 1000;
      break;
    case 'm':
      num *= 1000000;
      break;
    case 'b':
      num *= 1000000000;
      break;
  }

  return Math.round(num);
}

/**
 * Parse an integer from text
 * Examples:
 *   "1,234" -> 1234
 *   "1234" -> 1234
 *   "(1,234)" -> 1234
 */
export function parseInteger(text: string | null | undefined): number | null {
  if (!text) return null;

  const cleaned = text.replace(/[(),\s]/g, '').trim();
  const num = parseInt(cleaned, 10);

  return isNaN(num) ? null : num;
}

/**
 * Parse a float from text
 * Examples:
 *   "4.5" -> 4.5
 *   "4.5 out of 5" -> 4.5
 *   "4.5/5" -> 4.5
 */
export function parseFloatText(text: string | null | undefined): number | null {
  if (!text) return null;

  // Extract first decimal number
  const match = text.match(/([\d.]+)/);
  if (!match) return null;

  const num = Number.parseFloat(match[1]!);
  return isNaN(num) ? null : num;
}

/**
 * Format count for display
 * Examples:
 *   1234 -> "1.2K"
 *   1234567 -> "1.2M"
 *   1234567890 -> "1.2B"
 */
export function formatCount(count: number): string {
  if (count >= 1000000000) {
    return `${(count / 1000000000).toFixed(1)}B`;
  }
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Format count with full number
 */
export function formatCountFull(count: number): string {
  return new Intl.NumberFormat('en-US').format(count);
}
