/**
 * MCP Server with SSE Transport
 * Enables remote Agent connection via MCP protocol over HTTP/SSE
 */

import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool handlers
import { crawlBestsellers, crawlBestsellersTool } from '../dist/tools/crawl-bestsellers.js';
import { crawlProduct, crawlProductTool } from '../dist/tools/crawl-product.js';
import { crawlReviews, crawlReviewsTool } from '../dist/tools/crawl-reviews.js';
import { crawlSearch, crawlSearchTool } from '../dist/tools/crawl-search.js';
import { crawlCreator, crawlCreatorTool } from '../dist/tools/crawl-creator.js';
import { crawlVideo, crawlVideoTool } from '../dist/tools/crawl-video.js';
import { crawlShop, crawlShopTool } from '../dist/tools/crawl-shop.js';
import { getCrawlStatus, getCrawlStatusTool } from '../dist/tools/get-crawl-status.js';

const PORT = process.env.PORT || 3000;
const SERVER_NAME = 'webcrawler-mcp';
const SERVER_VERSION = '1.0.0';

// Tool registry
const tools = [
  crawlBestsellersTool,
  crawlProductTool,
  crawlReviewsTool,
  crawlSearchTool,
  crawlCreatorTool,
  crawlVideoTool,
  crawlShopTool,
  getCrawlStatusTool,
];

const toolHandlers = {
  'crawl_bestsellers': crawlBestsellers,
  'crawl_product': crawlProduct,
  'crawl_reviews': crawlReviews,
  'crawl_search': crawlSearch,
  'crawl_creator': crawlCreator,
  'crawl_video': crawlVideo,
  'crawl_shop': crawlShop,
  'get_crawl_status': getCrawlStatus,
};

// Store active transports by session ID
const transports = new Map();

// Create MCP server instance
function createMCPServer() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    console.log(`[${new Date().toISOString()}] Tool call: ${name}`);

    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Unknown tool: ${name}`,
            }),
          },
        ],
      };
    }

    try {
      const result = await handler(args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Tool error (${name}):`, errorMessage);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
            }),
          },
        ],
      };
    }
  });

  return server;
}

// HTTP Server
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mode: 'mcp-sse',
      activeSessions: transports.size,
    }));
    return;
  }

  // SSE endpoint - establishes MCP connection
  if (url.pathname === '/sse' && req.method === 'GET') {
    console.log(`[${new Date().toISOString()}] New SSE connection`);

    const transport = new SSEServerTransport('/message', res);
    const server = createMCPServer();

    transports.set(transport.sessionId, transport);
    console.log(`[${new Date().toISOString()}] Session created: ${transport.sessionId}`);

    // Clean up when HTTP connection closes (client disconnect)
    res.on('close', () => {
      console.log(`[${new Date().toISOString()}] SSE connection closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    });

    transport.onclose = () => {
      console.log(`[${new Date().toISOString()}] Transport closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    };

    // server.connect() automatically calls transport.start()
    await server.connect(transport);
    return;
  }

  // Message endpoint - receives messages from client
  if (url.pathname === '/message' && req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId' }));
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    await transport.handlePostMessage(req, res);
    return;
  }

  // List tools (REST fallback)
  if (url.pathname === '/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tools: tools.map(t => t.name),
      mode: 'mcp-sse',
      sseEndpoint: '/sse',
      messageEndpoint: '/message',
    }));
    return;
  }

  // REST API fallback for direct tool calls
  const toolMatch = url.pathname.match(/^\/tool\/([a-z_]+)$/);
  if (toolMatch && req.method === 'POST') {
    const toolName = toolMatch[1];
    const handler = toolHandlers[toolName];

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
      console.log(`[${new Date().toISOString()}] REST call: ${toolName}`, args);

      const result = await handler(args);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error(`REST error (${toolName}):`, error);
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

httpServer.listen(PORT, () => {
  console.log(`MCP SSE Server running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health  - Health check`);
  console.log(`  GET  /sse     - MCP SSE connection (for agents)`);
  console.log(`  POST /message - MCP message handler`);
  console.log(`  GET  /tools   - List available tools`);
  console.log(`  POST /tool/:name - REST API fallback`);
});
