# Multi-stage build for WebCrawler MCP Server
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage with Playwright
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Install Node.js 20 and curl (for healthcheck)
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts

# Create non-root user for security
RUN groupadd -r mcpuser && useradd -r -g mcpuser mcpuser \
    && chown -R mcpuser:mcpuser /app

USER mcpuser

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV BROWSER_HEADLESS=true
ENV BROWSER_POOL_SIZE=2
ENV PORT=3000

# Expose HTTP port
EXPOSE 3000

# Health check for HTTP mode
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:3000/health || exit 1

# Run HTTP server (not stdio)
CMD ["node", "scripts/http-server.js"]
