/**
 * Date parsing and normalization
 * Handles relative dates and various formats
 */

import { parseISO, subDays, subHours, subMinutes, subWeeks, subMonths, format, isValid } from 'date-fns';

/**
 * Parse a relative date string to ISO 8601
 * Examples:
 *   "just now" -> current time
 *   "5 minutes ago" -> 5 minutes ago
 *   "3 hours ago" -> 3 hours ago
 *   "2 days ago" -> 2 days ago
 *   "1 week ago" -> 1 week ago
 *   "2 months ago" -> 2 months ago
 */
export function parseRelativeDate(
  text: string | null | undefined,
  referenceDate?: Date,
): string | null {
  if (!text) return null;

  const now = referenceDate ?? new Date();
  const lowerText = text.toLowerCase().trim();

  // Just now / seconds ago
  if (lowerText === 'just now' || lowerText.match(/^\d+\s*s(ec(ond)?s?)?\s*ago$/)) {
    return now.toISOString();
  }

  // Minutes ago
  const minutesMatch = lowerText.match(/^(\d+)\s*m(in(ute)?s?)?\s*ago$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1]!, 10);
    return subMinutes(now, minutes).toISOString();
  }

  // Hours ago
  const hoursMatch = lowerText.match(/^(\d+)\s*h(our)?s?\s*ago$/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]!, 10);
    return subHours(now, hours).toISOString();
  }

  // Days ago
  const daysMatch = lowerText.match(/^(\d+)\s*d(ay)?s?\s*ago$/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]!, 10);
    return subDays(now, days).toISOString();
  }

  // Weeks ago
  const weeksMatch = lowerText.match(/^(\d+)\s*w(eek)?s?\s*ago$/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1]!, 10);
    return subWeeks(now, weeks).toISOString();
  }

  // Months ago
  const monthsMatch = lowerText.match(/^(\d+)\s*m(onth)?s?\s*ago$/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]!, 10);
    return subMonths(now, months).toISOString();
  }

  // Yesterday
  if (lowerText === 'yesterday') {
    return subDays(now, 1).toISOString();
  }

  // Try ISO 8601 format
  try {
    const parsed = parseISO(text);
    if (isValid(parsed)) {
      return parsed.toISOString();
    }
  } catch {
    // Not valid ISO format
  }

  // Try common date formats
  const dateFormats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
    /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/, // Month DD, YYYY
  ];

  for (const pattern of dateFormats) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = new Date(text);
        if (isValid(parsed)) {
          return parsed.toISOString();
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Parse an ISO 8601 date string
 */
export function parseISODate(text: string | null | undefined): Date | null {
  if (!text) return null;

  try {
    const parsed = parseISO(text);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, formatStr = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format date as relative time
 */
export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  if (diffWeeks < 4) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }

  return format(d, 'MMM d, yyyy');
}

/**
 * Get current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}
