/**
 * HTTP wrapper for MCP Server
 * Exposes MCP tools as REST API endpoints
 */

import http from 'http';
import { crawlBestsellers } from '../dist/tools/crawl-bestsellers.js';
import { crawlProduct } from '../dist/tools/crawl-product.js';
import { crawlReviews } from '../dist/tools/crawl-reviews.js';
import { crawlSearch } from '../dist/tools/crawl-search.js';
import { crawlCreator } from '../dist/tools/crawl-creator.js';
import { crawlVideo } from '../dist/tools/crawl-video.js';
import { getCrawlStatus } from '../dist/tools/get-crawl-status.js';
import { browserPool } from '../dist/browser/pool.js';

const PORT = process.env.PORT || 3000;

const tools = {
  'crawl_bestsellers': crawlBestsellers,
  'crawl_product': crawlProduct,
  'crawl_reviews': crawlReviews,
  'crawl_search': crawlSearch,
  'crawl_creator': crawlCreator,
  'crawl_video': crawlVideo,
  'get_crawl_status': getCrawlStatus,
};

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // List tools
  if (req.url === '/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: Object.keys(tools) }));
    return;
  }

  // Debug endpoint: GET /debug?url=...
  if (req.url?.startsWith('/debug') && req.method === 'GET') {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`);
    const targetUrl = urlParams.searchParams.get('url') || 'https://www.tiktok.com/shop/search?q=lip%20gloss';

    try {
      const browserContext = await browserPool.acquire();
      const page = await browserContext.newPage();

      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(5000);

      // Get page info
      const debugInfo = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[id]'));
        const scriptInfo = scripts.map(s => ({ id: s.id, length: s.textContent?.length || 0 }));

        // Check for specific TikTok data
        const universalData = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
        const sigiState = document.querySelector('#SIGI_STATE');
        const nextData = document.querySelector('#__NEXT_DATA__');

        // Extract all product-related links
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const productLinks = allLinks
          .map(a => a.href)
          .filter(href => href && (
            href.includes('/product/') ||
            href.includes('/view/product/') ||
            href.includes('product_id=') ||
            href.includes('/p/')
          ))
          .slice(0, 20);

        // Extract product IDs from data attributes or JSON
        const productIds = [];
        const routerData = document.querySelector('#__MODERN_ROUTER_DATA__');
        if (routerData?.textContent) {
          const matches = routerData.textContent.match(/product[_-]?id['":\s]+['"]?(\d+)/gi) || [];
          matches.forEach(m => {
            const id = m.match(/(\d+)/);
            if (id) productIds.push(id[1]);
          });
        }

        return {
          url: window.location.href,
          title: document.title || 'No title',
          bodyLength: document.body?.innerHTML?.length || 0,
          scriptTags: scriptInfo,
          hasUniversalData: !!universalData,
          hasSigiState: !!sigiState,
          hasNextData: !!nextData,
          productLinks: productLinks,
          productIds: productIds.slice(0, 10),
          // Sample of body content (first 2000 chars)
          bodySample: document.body?.innerText?.substring(0, 2000) || 'No body content',
        };
      });

      // Take screenshot (with timeout protection)
      let screenshot = null;
      try {
        screenshot = await Promise.race([
          page.screenshot({ type: 'png', fullPage: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 10000))
        ]);
      } catch (e) {
        console.log('Screenshot failed:', e.message);
      }

      await page.close();
      browserPool.release(browserContext);

      // Return debug info (screenshot as base64 if available)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...debugInfo,
        screenshot: screenshot ? screenshot.toString('base64') : null,
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Tool execution: POST /tool/:name
  const toolMatch = req.url?.match(/^\/tool\/([a-z_]+)$/);
  if (toolMatch && req.method === 'POST') {
    const toolName = toolMatch[1];
    const handler = tools[toolName];

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Tool not found: ${toolName}` }));
      return;
    }

    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      const args = body ? JSON.parse(body) : {};
      console.log(`[${new Date().toISOString()}] Executing ${toolName}`, args);

      const result = await handler(args);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error(`Error executing ${toolName}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`WebCrawler MCP HTTP Server running on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /tools - List available tools`);
  console.log(`  POST /tool/:name - Execute a tool`);
});
