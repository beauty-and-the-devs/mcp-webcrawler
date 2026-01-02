/**
 * Browser context pool management
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getStealthOptions, applyStealthToPage } from './stealth.js';
import { logger } from '../utils/logger.js';

const MAX_CONCURRENT = parseInt(process.env['MAX_CONCURRENT_PAGES'] ?? '3', 10);
const HEADLESS = process.env['BROWSER_HEADLESS'] !== 'false';

// Proxy configuration from environment
const PROXY_SERVER = process.env['PROXY_SERVER'] || ''; // e.g., 'http://brd.superproxy.io:22225'
const PROXY_USERNAME = process.env['PROXY_USERNAME'] || ''; // e.g., 'brd-customer-XXXXX-zone-residential'
const PROXY_PASSWORD = process.env['PROXY_PASSWORD'] || '';

// Generate random session ID for Bright Data IP rotation
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

// Build proxy username with session ID for IP rotation
function getProxyUsername(): string {
  if (!PROXY_USERNAME) return '';
  // Append session ID to username for Bright Data IP rotation
  // Format: brd-customer-XXXXX-zone-ZONE-session-RANDOM
  return `${PROXY_USERNAME}-${generateSessionId()}`;
}

interface PooledContext {
  context: BrowserContext;
  inUse: boolean;
  createdAt: Date;
  useCount: number;
}

class BrowserPool {
  private browser: Browser | null = null;
  private contexts: PooledContext[] = [];
  private initPromise: Promise<void> | null = null;
  private maxContextAge = 10 * 60 * 1000; // 10 minutes (shorter for IP rotation)
  private maxUseCount = 5; // Recycle after 5 uses (more frequent IP rotation)

  async initialize(): Promise<void> {
    if (this.browser) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    logger.info({ headless: HEADLESS, maxConcurrent: MAX_CONCURRENT }, 'Initializing browser');

    this.browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    logger.info('Browser initialized');
  }

  async acquirePage(): Promise<Page> {
    await this.initialize();

    // Find available context or create new one
    let pooledContext = this.contexts.find((c) => !c.inUse && !this.shouldRecycle(c));

    if (!pooledContext) {
      // Check if we can create more
      if (this.contexts.length >= MAX_CONCURRENT) {
        // Wait for one to become available
        pooledContext = await this.waitForAvailable();
      } else {
        // Create new context
        pooledContext = await this.createContext();
      }
    }

    pooledContext.inUse = true;
    pooledContext.useCount++;

    const page = await pooledContext.context.newPage();
    await applyStealthToPage(page);

    // Attach cleanup handler
    (page as unknown as { __pooledContext: PooledContext }).__pooledContext = pooledContext;

    logger.debug(
      { contextCount: this.contexts.length, useCount: pooledContext.useCount },
      'Page acquired',
    );

    return page;
  }

  async releasePage(page: Page): Promise<void> {
    const pooledContext = (page as unknown as { __pooledContext?: PooledContext }).__pooledContext;

    try {
      await page.close();
    } catch (error) {
      logger.warn({ error }, 'Error closing page');
    }

    if (pooledContext) {
      pooledContext.inUse = false;

      // Check if context should be recycled
      if (this.shouldRecycle(pooledContext)) {
        await this.recycleContext(pooledContext);
      }
    }

    logger.debug('Page released');
  }

  private shouldRecycle(pooledContext: PooledContext): boolean {
    const age = Date.now() - pooledContext.createdAt.getTime();
    return age > this.maxContextAge || pooledContext.useCount >= this.maxUseCount;
  }

  private async createContext(): Promise<PooledContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const stealthOptions = getStealthOptions();

    // Add proxy configuration if available (with IP rotation via session ID)
    if (PROXY_SERVER) {
      const proxyUsername = getProxyUsername();
      stealthOptions.proxy = {
        server: PROXY_SERVER,
        username: proxyUsername || undefined,
        password: PROXY_PASSWORD || undefined,
      };
      logger.debug({ proxyServer: PROXY_SERVER, proxyUsername }, 'Using proxy server with session-based IP rotation');
    }

    const context = await this.browser.newContext(stealthOptions);

    const pooledContext: PooledContext = {
      context,
      inUse: false,
      createdAt: new Date(),
      useCount: 0,
    };

    this.contexts.push(pooledContext);
    logger.debug({ contextCount: this.contexts.length }, 'Created new browser context');

    return pooledContext;
  }

  private async recycleContext(pooledContext: PooledContext): Promise<void> {
    const index = this.contexts.indexOf(pooledContext);
    if (index > -1) {
      this.contexts.splice(index, 1);
    }

    try {
      await pooledContext.context.close();
    } catch (error) {
      logger.warn({ error }, 'Error closing context during recycle');
    }

    logger.debug({ contextCount: this.contexts.length }, 'Recycled browser context');
  }

  private async waitForAvailable(): Promise<PooledContext> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const available = this.contexts.find((c) => !c.inUse && !this.shouldRecycle(c));
        if (available) {
          clearInterval(checkInterval);
          resolve(available);
        }
      }, 100);
    });
  }

  async close(): Promise<void> {
    logger.info('Closing browser pool');

    for (const pooledContext of this.contexts) {
      try {
        await pooledContext.context.close();
      } catch (error) {
        logger.warn({ error }, 'Error closing context');
      }
    }

    this.contexts = [];

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn({ error }, 'Error closing browser');
      }
      this.browser = null;
    }

    this.initPromise = null;
    logger.info('Browser pool closed');
  }

  getStats(): { contextCount: number; inUse: number; available: number; active: number; max: number } {
    const inUse = this.contexts.filter((c) => c.inUse).length;
    return {
      contextCount: this.contexts.length,
      inUse,
      available: this.contexts.length - inUse,
      active: inUse,
      max: MAX_CONCURRENT,
    };
  }

  // Alternative API that returns BrowserContext directly
  async acquire(): Promise<BrowserContext> {
    await this.initialize();

    let pooledContext = this.contexts.find((c) => !c.inUse && !this.shouldRecycle(c));

    if (!pooledContext) {
      if (this.contexts.length >= MAX_CONCURRENT) {
        pooledContext = await this.waitForAvailable();
      } else {
        pooledContext = await this.createContext();
      }
    }

    pooledContext.inUse = true;
    pooledContext.useCount++;

    // Attach pooled context reference
    (pooledContext.context as unknown as { __pooled: PooledContext }).__pooled = pooledContext;

    logger.debug(
      { contextCount: this.contexts.length, useCount: pooledContext.useCount },
      'Context acquired',
    );

    return pooledContext.context;
  }

  release(context: BrowserContext): void {
    const pooled = (context as unknown as { __pooled?: PooledContext }).__pooled;

    if (pooled) {
      pooled.inUse = false;

      if (this.shouldRecycle(pooled)) {
        this.recycleContext(pooled).catch((err) => {
          logger.warn({ error: err }, 'Error recycling context');
        });
      }
    }

    logger.debug('Context released');
  }
}

// Singleton instance
export const browserPool = new BrowserPool();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await browserPool.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserPool.close();
  process.exit(0);
});

// Export types
export type { Page, BrowserContext };
