/**
 * Base extractor abstract class
 */

import type { Page } from 'playwright';
import { RunContext } from '../store/run-context.js';
import { loadSelectors, type SelectorConfig, type SelectorDef } from '../utils/selectors.js';
import { logger } from '../utils/logger.js';

export interface ExtractorOptions {
  timeout?: number;
  maxScrolls?: number;
  scrollDelay?: number;
}

const DEFAULT_OPTIONS: Required<ExtractorOptions> = {
  timeout: 10000,
  maxScrolls: 10,
  scrollDelay: 1000,
};

export abstract class BaseExtractor<TInput, TOutput> {
  protected config: SelectorConfig;
  protected options: Required<ExtractorOptions>;
  protected log: ReturnType<typeof logger.child>;

  constructor(
    protected page: Page,
    protected context: RunContext,
    pageType: string,
    options: ExtractorOptions = {},
  ) {
    this.config = loadSelectors(pageType);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.log = logger.child({ extractor: this.constructor.name, runId: context.runId });
  }

  abstract extract(input: TInput): Promise<TOutput>;

  // ============================================================================
  // Content waiting methods
  // ============================================================================

  protected async waitForContent(selector: string, timeout?: number): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, {
        timeout: timeout ?? this.options.timeout,
        state: 'visible',
      });
      return true;
    } catch {
      return false;
    }
  }

  protected async waitForAny(selectors: string[], timeout?: number): Promise<string | null> {
    const t = timeout ?? this.options.timeout;

    try {
      await Promise.race(
        selectors.map((s) => this.page.waitForSelector(s, { timeout: t })),
      );

      // Find which one matched
      for (const selector of selectors) {
        const element = await this.page.$(selector);
        if (element) return selector;
      }
    } catch {
      // None found
    }

    return null;
  }

  // ============================================================================
  // Scrolling methods
  // ============================================================================

  protected async scrollToLoad(maxScrolls?: number): Promise<number> {
    const max = maxScrolls ?? this.options.maxScrolls;
    let previousHeight = 0;
    let scrollCount = 0;

    while (scrollCount < max) {
      const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        break;
      }

      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await this.page.waitForTimeout(this.options.scrollDelay);
      previousHeight = currentHeight;
      scrollCount++;
    }

    this.log.debug({ scrollCount }, 'Scroll completed');
    return scrollCount;
  }

  protected async scrollToElement(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
        return true;
      }
    } catch {
      // Element not found
    }
    return false;
  }

  // ============================================================================
  // Safe extraction methods
  // ============================================================================

  protected async safeExtract<T>(
    fn: () => Promise<T>,
    fieldName: string,
    defaultValue: T,
  ): Promise<T> {
    try {
      const value = await fn();
      this.context.trackField(fieldName, value);
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.context.addError({
        field: fieldName,
        error_code: 'PARSE_ERROR',
        message,
      });
      this.context.trackField(fieldName, null);
      return defaultValue;
    }
  }

  protected async extractText(selector: string | string[]): Promise<string | null> {
    const selectors = Array.isArray(selector) ? selector : [selector];

    for (const s of selectors) {
      try {
        const element = await this.page.$(s);
        if (element) {
          const text = await element.textContent();
          if (text) return text.trim();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  protected async extractAttribute(
    selector: string | string[],
    attribute: string,
  ): Promise<string | null> {
    const selectors = Array.isArray(selector) ? selector : [selector];

    for (const s of selectors) {
      try {
        const element = await this.page.$(s);
        if (element) {
          const value = await element.getAttribute(attribute);
          if (value) return value;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  protected async extractAllText(selector: string | string[]): Promise<string[]> {
    const selectors = Array.isArray(selector) ? selector : [selector];
    const results: string[] = [];

    for (const s of selectors) {
      try {
        const elements = await this.page.$$(s);
        for (const element of elements) {
          const text = await element.textContent();
          if (text) results.push(text.trim());
        }
      } catch {
        continue;
      }
    }

    return results;
  }

  protected async extractAllAttributes(
    selector: string | string[],
    attribute: string,
  ): Promise<string[]> {
    const selectors = Array.isArray(selector) ? selector : [selector];
    const results: string[] = [];

    for (const s of selectors) {
      try {
        const elements = await this.page.$$(s);
        for (const element of elements) {
          const value = await element.getAttribute(attribute);
          if (value) results.push(value);
        }
      } catch {
        continue;
      }
    }

    return results;
  }

  // ============================================================================
  // Selector config helpers
  // ============================================================================

  protected getSelectorDef(path: string): SelectorDef | undefined {
    const parts = path.split('.');
    let current: unknown = this.config.selectors;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current as SelectorDef | undefined;
  }

  protected getSelectors(path: string): string[] {
    const def = this.getSelectorDef(path);
    if (!def) return [];
    return def.selectors ?? [];
  }

  protected async extractFromConfig(
    path: string,
    options: { attribute?: string; multiple?: boolean } = {},
  ): Promise<string | string[] | null> {
    const def = this.getSelectorDef(path);
    if (!def || !def.selectors) return null;

    const attribute = options.attribute ?? def.attribute;

    if (options.multiple) {
      return attribute
        ? await this.extractAllAttributes(def.selectors, attribute)
        : await this.extractAllText(def.selectors);
    }

    return attribute
      ? await this.extractAttribute(def.selectors, attribute)
      : await this.extractText(def.selectors);
  }

  // ============================================================================
  // Parsing helpers
  // ============================================================================

  protected parsePattern(text: string | null, pattern: string): string | null {
    if (!text) return null;
    const match = text.match(new RegExp(pattern));
    return match?.[1] ?? null;
  }

  protected parseFloat(text: string | null): number | null {
    if (!text) return null;
    const cleaned = text.replace(/[,$]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  protected parseInt(text: string | null): number | null {
    if (!text) return null;
    const cleaned = text.replace(/[,$]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  protected parseCount(text: string | null): number | null {
    if (!text) return null;

    const cleaned = text.replace(/[,$\s]/g, '').toLowerCase();
    const match = cleaned.match(/([\d.]+)([km])?/);

    if (!match) return null;

    let num = parseFloat(match[1]!);
    if (isNaN(num)) return null;

    const suffix = match[2];
    if (suffix === 'k') num *= 1000;
    if (suffix === 'm') num *= 1000000;

    return Math.round(num);
  }

  // ============================================================================
  // Element counting
  // ============================================================================

  protected async countElements(selector: string | string[]): Promise<number> {
    const selectors = Array.isArray(selector) ? selector : [selector];

    for (const s of selectors) {
      try {
        const elements = await this.page.$$(s);
        if (elements.length > 0) return elements.length;
      } catch {
        continue;
      }
    }

    return 0;
  }

  protected async elementExists(selector: string | string[]): Promise<boolean> {
    return (await this.countElements(selector)) > 0;
  }
}
