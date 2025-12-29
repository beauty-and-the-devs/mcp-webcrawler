#!/bin/bash
# EC2 Initial Setup Script
# Run this on a fresh Amazon Linux 2023 / Ubuntu EC2 instance

set -e

echo "=== EC2 Initial Setup for WebCrawler MCP ==="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS="unknown"
fi

echo "Detected OS: $OS"

# Install Docker
echo "Installing Docker..."
if [ "$OS" == "amzn" ] || [ "$OS" == "rhel" ] || [ "$OS" == "centos" ]; then
    # Amazon Linux / RHEL / CentOS
    sudo yum update -y
    sudo yum install -y docker git
    sudo systemctl start docker
    sudo systemctl enable docker
elif [ "$OS" == "ubuntu" ] || [ "$OS" == "debian" ]; then
    # Ubuntu / Debian
    sudo apt-get update
    sudo apt-get install -y docker.io git
    sudo systemctl start docker
    sudo systemctl enable docker
else
    echo "Unsupported OS. Please install Docker manually."
    exit 1
fi

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
echo "Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create app directory
echo "Setting up application directory..."
sudo mkdir -p /opt/webcrawler-mcp
sudo chown $USER:$USER /opt/webcrawler-mcp

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Log out and log back in (for docker group)"
echo "2. Clone your repository:"
echo "   cd /opt/webcrawler-mcp"
echo "   git clone <your-repo-url> ."
echo ""
echo "3. Deploy:"
echo "   ./scripts/deploy.sh          # For stdio mode"
echo "   ./scripts/deploy.sh --http   # For HTTP API mode"
echo ""
echo "Recommended EC2 instance types:"
echo "  - t3.medium (2 vCPU, 4 GB RAM) - Minimum"
echo "  - t3.large (2 vCPU, 8 GB RAM) - Recommended"
echo "  - t3.xlarge (4 vCPU, 16 GB RAM) - High load"
