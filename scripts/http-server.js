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
