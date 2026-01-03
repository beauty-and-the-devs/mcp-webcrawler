#!/usr/bin/env node
/**
 * WebCrawlerMCP - MCP Server Entry Point
 * TikTok Shop Data Collection Server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger } from './utils/logger.js';
import { browserPool } from './browser/pool.js';

// Import tool handlers
import { crawlBestsellersTool } from './tools/crawl-bestsellers.js';
import { crawlProductTool } from './tools/crawl-product.js';
import { crawlReviewsTool } from './tools/crawl-reviews.js';
import { crawlSearchTool } from './tools/crawl-search.js';
import { crawlCreatorTool } from './tools/crawl-creator.js';
import { crawlVideoTool } from './tools/crawl-video.js';
import { crawlShopTool } from './tools/crawl-shop.js';
import { getCrawlStatusTool } from './tools/get-crawl-status.js';

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

const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  [crawlBestsellersTool.name]: crawlBestsellersTool.handler,
  [crawlProductTool.name]: crawlProductTool.handler,
  [crawlReviewsTool.name]: crawlReviewsTool.handler,
  [crawlSearchTool.name]: crawlSearchTool.handler,
  [crawlCreatorTool.name]: crawlCreatorTool.handler,
  [crawlVideoTool.name]: crawlVideoTool.handler,
  [crawlShopTool.name]: crawlShopTool.handler,
  [getCrawlStatusTool.name]: getCrawlStatusTool.handler,
};

async function main() {
  logger.info({ server: SERVER_NAME, version: SERVER_VERSION }, 'Starting MCP server');

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Handling list_tools request');

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

    logger.info({ tool: name }, 'Handling call_tool request');

    const handler = toolHandlers[name];
    if (!handler) {
      logger.error({ tool: name }, 'Unknown tool');
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

      logger.info({ tool: name }, 'Tool execution completed');

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
      logger.error({ tool: name, error: errorMessage }, 'Tool execution failed');

      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Validation error',
                details: error.errors.map((e) => ({
                  path: e.path.join('.'),
                  message: e.message,
                })),
              }),
            },
          ],
        };
      }

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

  // Create transport and connect
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down MCP server');
    await browserPool.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect and run
  await server.connect(transport);

  logger.info('MCP server running on stdio');
}

// Run the server
main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Server startup failed');
  process.exit(1);
});
