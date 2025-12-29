#!/bin/bash
# EC2 Deployment Script for WebCrawler MCP Server

set -e

echo "=== WebCrawler MCP Server Deployment ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    sudo yum update -y
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed successfully${NC}"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
fi

# Pull latest code
echo -e "${YELLOW}Pulling latest code...${NC}"
git pull origin main

# Build and start containers
echo -e "${YELLOW}Building and starting containers...${NC}"

# Check if we want HTTP mode
if [ "$1" == "--http" ]; then
    echo -e "${YELLOW}Starting in HTTP mode (port 3000)...${NC}"
    docker compose --profile http up -d --build
else
    echo -e "${YELLOW}Starting in stdio mode...${NC}"
    docker compose up -d --build webcrawler-mcp
fi

# Show status
echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
docker compose ps

echo ""
echo "Useful commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose restart          # Restart services"
echo "  docker compose down             # Stop services"
echo "  docker compose --profile http up -d  # Start HTTP server"
