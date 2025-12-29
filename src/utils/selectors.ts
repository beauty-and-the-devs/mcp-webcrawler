/**
 * YAML selector config loader
 */

import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';
import { logger } from './logger.js';

export interface SelectorDef {
  source: 'dom' | 'url' | 'meta';
  selectors?: string[];
  pattern?: string;
  transform?: string;
  fallback?: unknown;
  attribute?: string;
}

export interface TransformDef {
  type: 'regex' | 'number' | 'date' | 'boolean' | 'json';
  pattern?: string;
  output?: string;
}

export interface SelectorConfig {
  version: string;
  page_type: string;
  selectors: Record<string, SelectorDef | Record<string, SelectorDef>>;
  transforms?: Record<string, TransformDef>;
}

const cache = new Map<string, SelectorConfig>();

export function getConfigPath(pageType: string): string {
  return join(process.cwd(), 'config', 'selectors', `${pageType}.yaml`);
}

export function loadSelectors(pageType: string): SelectorConfig {
  if (cache.has(pageType)) {
    return cache.get(pageType)!;
  }

  const configPath = getConfigPath(pageType);

  if (!existsSync(configPath)) {
    logger.warn({ pageType, configPath }, 'Selector config not found');
    // Return empty config
    return {
      version: '0.0.0',
      page_type: pageType,
      selectors: {},
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parse(content) as SelectorConfig;
    cache.set(pageType, config);
    logger.debug({ pageType, version: config.version }, 'Loaded selector config');
    return config;
  } catch (error) {
    logger.error({ pageType, error }, 'Failed to load selector config');
    throw error;
  }
}

export function clearSelectorCache(): void {
  cache.clear();
}

export function reloadSelectors(pageType: string): SelectorConfig {
  cache.delete(pageType);
  return loadSelectors(pageType);
}

// Helper to get nested selector config
export function getSelector(
  config: SelectorConfig,
  path: string,
): SelectorDef | undefined {
  const parts = path.split('.');
  let current: unknown = config.selectors;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as SelectorDef | undefined;
}

// Type for extracted field result
export interface ExtractResult<T = unknown> {
  value: T | null;
  success: boolean;
  selector?: string;
  error?: string;
}
