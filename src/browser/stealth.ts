/**
 * Browser stealth configuration for detection bypass
 */

import type { BrowserContextOptions } from 'playwright';

// Modern Chrome User-Agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Viewport sizes for randomization
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
];

// Random selection helper
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// Random integer in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get randomized stealth options for browser context
 */
export function getStealthOptions(): BrowserContextOptions {
  const userAgent = randomChoice(USER_AGENTS);
  const viewport = randomChoice(VIEWPORTS);

  return {
    userAgent,
    viewport: {
      width: viewport.width + randomInt(-50, 50),
      height: viewport.height + randomInt(-30, 30),
    },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    geolocation: {
      latitude: 37.7749 + randomInt(-1, 1) * 0.01,
      longitude: -122.4194 + randomInt(-1, 1) * 0.01,
    },
    permissions: ['geolocation'],
    colorScheme: randomChoice(['light', 'dark', 'no-preference']),
    deviceScaleFactor: randomChoice([1, 1.25, 1.5, 2]),
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
    acceptDownloads: false,
    ignoreHTTPSErrors: true,
    bypassCSP: false,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  };
}

/**
 * Stealth scripts to inject on page creation
 */
export const STEALTH_SCRIPTS = {
  // Hide webdriver flag
  hideWebdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  `,

  // Mock plugins
  mockPlugins: `
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });
  `,

  // Mock languages
  mockLanguages: `
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  `,

  // Mock WebGL vendor/renderer
  mockWebGL: `
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.call(this, parameter);
    };
  `,

  // Mock permissions
  mockPermissions: `
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  `,

  // Hide automation flags
  hideAutomation: `
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  `,
};

/**
 * Get all stealth scripts as a single string
 */
export function getAllStealthScripts(): string {
  return Object.values(STEALTH_SCRIPTS).join('\n');
}

/**
 * Apply stealth scripts to a page
 */
export async function applyStealthToPage(page: { addInitScript: (script: string) => Promise<void> }): Promise<void> {
  await page.addInitScript(getAllStealthScripts());
}
