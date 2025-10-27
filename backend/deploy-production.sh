#!/bin/bash

# Production deployment script for Webarmonium Backend
# Server: tripitak.it (IP: 164.92.147.74)

set -e

echo "🚀 Starting Webarmonium Backend Production Deployment"

# Configuration
SERVER_IP="164.92.147.74"
SERVER_USER="root"  # Change if needed
REMOTE_DIR="/var/www/webarmonium/backend"
PORT="3001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo -e "   Server: ${SERVER_IP}"
echo -e "   Remote Directory: ${REMOTE_DIR}"
echo -e "   Port: ${PORT}"
echo ""

# Check if we're on the production branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "production-backend" ]; then
    echo -e "${RED}❌ Error: Not on production-backend branch${NC}"
    echo -e "   Current branch: $CURRENT_BRANCH"
    exit 1
fi

echo -e "${GREEN}✅ Branch check passed: $CURRENT_BRANCH${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
    npm ci --only=production
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Run tests
echo -e "${YELLOW}🧪 Running production tests...${NC}"
npm test

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
tar -czf webarmonium-backend-deploy.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=tests \
    --exclude=*.log \
    --exclude=.env \
    --exclude=coverage \
    .

echo -e "${GREEN}✅ Deployment package created${NC}"

# Deploy to server (this would need SSH keys to be set up)
echo -e "${YELLOW}🚀 Deploying to server...${NC}"
echo -e "${YELLOW}   Note: This requires SSH access to be configured${NC}"

# Example deployment commands (uncomment when SSH is set up)
# ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_DIR"
# scp webarmonium-backend-deploy.tar.gz $SERVER_USER@$SERVER_IP:$REMOTE_DIR/
# ssh $SERVER_USER@$SERVER_IP "cd $REMOTE_DIR && tar -xzf webarmonium-backend-deploy.tar.gz && rm webarmonium-backend-deploy.tar.gz"
# ssh $SERVER_USER@$SERVER_IP "cd $REMOTE_DIR && npm ci --only=production"
# ssh $SERVER_USER@$SERVER_IP "pm2 restart webarmonium-backend || pm2 start src/server.js --name webarmonium-backend"

echo -e "${GREEN}✅ Backend deployment script completed${NC}"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "   1. Set up SSH access to $SERVER_IP"
echo -e "   2. Configure PM2 process manager on server"
echo -e "   3. Set up environment variables on server"
echo -e "   4. Configure reverse proxy (nginx/apache)"
echo -e "   5. Uncomment and run the SSH deployment commands"

# Clean up
rm -f webarmonium-backend-deploy.tar.gz