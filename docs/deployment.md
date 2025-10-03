# 🚀 Webarmonium Deployment Guide

Complete production deployment guide for the Webarmonium collaborative music platform.

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.0.0 or higher
- **NPM**: 8.0.0 or higher
- **Memory**: 512MB minimum, 2GB recommended
- **CPU**: 1 core minimum, 2+ cores recommended
- **Storage**: 1GB available space

### Network Requirements
- **Incoming Ports**: 3001 (backend), 80/443 (frontend)
- **WebSocket Support**: Required for real-time communication
- **SSL/TLS**: Required for production (gyroscope access on mobile)

## 🐳 Docker Deployment (Recommended)

### 1. Build Docker Images

**Backend Dockerfile:**
```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY backend/ ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S webarmonium -u 1001

# Change ownership
RUN chown -R webarmonium:nodejs /app
USER webarmonium

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["npm", "start"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine as builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:alpine

# Copy build files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 2. Docker Compose Configuration

**docker-compose.prod.yml:**
```yaml
version: '3.8'

services:
  webarmonium-backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: webarmonium-backend
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - CORS_ORIGIN=https://webarmonium.app,https://www.webarmonium.app
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - webarmonium-network

  webarmonium-frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    container_name: webarmonium-frontend
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - webarmonium-backend
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    networks:
      - webarmonium-network

networks:
  webarmonium-network:
    driver: bridge
```

### 3. Deploy with Docker Compose

```bash
# Clone repository
git clone https://github.com/your-org/webarmonium.git
cd webarmonium

# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check health
curl http://localhost:3001/health
```

## ☁️ Cloud Platform Deployment

### AWS Deployment

**1. ECS with Fargate:**
```json
{
  "family": "webarmonium-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "webarmonium-backend",
      "image": "your-registry/webarmonium-backend:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3001"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/webarmonium-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**2. Application Load Balancer:**
```bash
# Create ALB with WebSocket support
aws elbv2 create-load-balancer \
  --name webarmonium-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-web \
  --scheme internet-facing \
  --type application

# Create target group for WebSocket
aws elbv2 create-target-group \
  --name webarmonium-backend-tg \
  --protocol HTTP \
  --port 3001 \
  --vpc-id vpc-12345 \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2
```

### Google Cloud Platform

**1. Cloud Run Deployment:**
```yaml
# cloudrun-backend.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: webarmonium-backend
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        autoscaling.knative.dev/minScale: "1"
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 100
      containers:
      - image: gcr.io/your-project/webarmonium-backend
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3001"
        resources:
          limits:
            cpu: "1000m"
            memory: "1Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 30
```

```bash
# Deploy to Cloud Run
gcloud run services replace cloudrun-backend.yaml
gcloud run services replace cloudrun-frontend.yaml

# Set up custom domain
gcloud run domain-mappings create \
  --service webarmonium-backend \
  --domain api.webarmonium.app
```

### Heroku Deployment

**1. Heroku Configuration:**
```json
// app.json
{
  "name": "webarmonium",
  "description": "Collaborative Generative Music Platform",
  "repository": "https://github.com/your-org/webarmonium",
  "keywords": ["music", "collaboration", "generative", "websocket"],
  "env": {
    "NODE_ENV": {
      "description": "Node environment",
      "value": "production"
    },
    "CORS_ORIGIN": {
      "description": "Allowed CORS origins",
      "value": "https://webarmonium.herokuapp.com"
    }
  },
  "formation": {
    "web": {
      "quantity": 1,
      "size": "standard-1x"
    }
  },
  "addons": [
    "papertrail:choklad"
  ],
  "buildpacks": [
    {
      "url": "heroku/nodejs"
    }
  ]
}
```

**2. Deploy to Heroku:**
```bash
# Create Heroku apps
heroku create webarmonium-backend
heroku create webarmonium-frontend

# Configure environment
heroku config:set NODE_ENV=production -a webarmonium-backend
heroku config:set CORS_ORIGIN=https://webarmonium-frontend.herokuapp.com -a webarmonium-backend

# Deploy backend
git subtree push --prefix=backend heroku-backend master

# Deploy frontend (after building)
npm run build
git add -f frontend/build
git commit -m "Add production build"
git subtree push --prefix=frontend/build heroku-frontend master
```

## 🌐 CDN and Static Asset Optimization

### CloudFlare Configuration

**1. DNS Setup:**
```bash
# A Records
webarmonium.app -> YOUR_SERVER_IP
www.webarmonium.app -> YOUR_SERVER_IP
api.webarmonium.app -> YOUR_SERVER_IP

# CNAME for CDN
cdn.webarmonium.app -> webarmonium.app
```

**2. CloudFlare Page Rules:**
```bash
# Cache static assets
cdn.webarmonium.app/static/*
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
- Browser Cache TTL: 1 day

# Bypass cache for API
api.webarmonium.app/*
- Cache Level: Bypass
- Disable Performance
- Disable Security (for WebSocket)
```

### AWS CloudFront

**1. Distribution Configuration:**
```json
{
  "CallerReference": "webarmonium-distribution",
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "webarmonium-frontend",
        "DomainName": "webarmonium-frontend.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      },
      {
        "Id": "webarmonium-backend",
        "DomainName": "api.webarmonium.app",
        "CustomOriginConfig": {
          "HTTPPort": 443,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "webarmonium-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "webarmonium-backend",
        "ViewerProtocolPolicy": "https-only",
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      }
    ]
  }
}
```

## 🔒 SSL/TLS Configuration

### Let's Encrypt with Certbot

**1. Install Certbot:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

**2. Generate Certificates:**
```bash
# Generate certificates for all domains
sudo certbot --nginx -d webarmonium.app -d www.webarmonium.app -d api.webarmonium.app

# Test auto-renewal
sudo certbot renew --dry-run

# Add auto-renewal cron job
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### Manual SSL Configuration

**nginx.conf:**
```nginx
server {
    listen 80;
    server_name webarmonium.app www.webarmonium.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name webarmonium.app www.webarmonium.app;

    ssl_certificate /etc/ssl/certs/webarmonium.crt;
    ssl_certificate_key /etc/ssl/private/webarmonium.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Serve React app
    root /var/www/webarmonium/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

server {
    listen 443 ssl http2;
    server_name api.webarmonium.app;

    ssl_certificate /etc/ssl/certs/webarmonium.crt;
    ssl_certificate_key /etc/ssl/private/webarmonium.key;

    # Proxy to backend
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # WebSocket timeout
        proxy_read_timeout 86400;
    }
}
```

## 📊 Monitoring and Logging

### Application Monitoring

**1. Health Check Endpoint:**
```javascript
// backend/healthcheck.js
const http = require('http')

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/health',
  method: 'GET',
  timeout: 3000
}

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0)
  } else {
    process.exit(1)
  }
})

req.on('error', () => {
  process.exit(1)
})

req.on('timeout', () => {
  req.destroy()
  process.exit(1)
})

req.end()
```

**2. PM2 Process Management:**
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'webarmonium-backend',
    script: './backend/src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    node_args: '--max-old-space-size=1024'
  }]
}
```

### Performance Monitoring

**1. New Relic Configuration:**
```javascript
// newrelic.js
exports.config = {
  app_name: ['Webarmonium Backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
```

**2. Custom Metrics Collection:**
```javascript
// backend/src/middleware/metrics.js
const promClient = require('prom-client')

const gestureLatencyHistogram = new promClient.Histogram({
  name: 'webarmonium_gesture_processing_duration_seconds',
  help: 'Duration of gesture processing in seconds',
  labelNames: ['gesture_type', 'user_device']
})

const websocketLatencyHistogram = new promClient.Histogram({
  name: 'webarmonium_websocket_latency_duration_seconds',
  help: 'WebSocket round-trip latency in seconds'
})

const activeRoomsGauge = new promClient.Gauge({
  name: 'webarmonium_active_rooms_total',
  help: 'Number of active rooms'
})

module.exports = {
  gestureLatencyHistogram,
  websocketLatencyHistogram,
  activeRoomsGauge
}
```

## 🔧 Environment Configuration

### Production Environment Variables

**Backend (.env.production):**
```bash
# Application
NODE_ENV=production
PORT=3001

# Security
CORS_ORIGIN=https://webarmonium.app,https://www.webarmonium.app
SESSION_SECRET=your-super-secure-session-secret

# Performance
MAX_ROOMS=1000
MAX_USERS_PER_ROOM=10
MEMORY_CLEANUP_INTERVAL=300000
GESTURE_RATE_LIMIT=100

# Monitoring
NEW_RELIC_LICENSE_KEY=your-new-relic-key
SENTRY_DSN=your-sentry-dsn

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

**Frontend (.env.production):**
```bash
REACT_APP_WEBSOCKET_URL=wss://api.webarmonium.app
REACT_APP_API_URL=https://api.webarmonium.app
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=1.0.0
REACT_APP_SENTRY_DSN=your-frontend-sentry-dsn
```

### Security Configuration

**1. Rate Limiting:**
```javascript
// backend/src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit')

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP'
})

const gestureLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 60, // Max 60 gestures per second
  skipSuccessfulRequests: true
})

module.exports = { apiLimiter, gestureLimit }
```

**2. Security Headers:**
```javascript
// backend/src/middleware/security.js
const helmet = require('helmet')

const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "wss://api.webarmonium.app"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
})

module.exports = securityMiddleware
```

## 🚨 Troubleshooting

### Common Issues

**1. WebSocket Connection Failures:**
```bash
# Check WebSocket support
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  https://api.webarmonium.app/socket.io/

# Expected response: 101 Switching Protocols
```

**2. High Memory Usage:**
```javascript
// Add memory monitoring
setInterval(() => {
  const usage = process.memoryUsage()
  console.log('Memory usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
  })
}, 30000)
```

**3. Performance Degradation:**
```bash
# Monitor gesture processing latency
curl -s https://api.webarmonium.app/api/metrics | grep gesture_processing

# Check WebSocket latency
curl -s https://api.webarmonium.app/api/metrics | grep websocket_latency

# Monitor room cleanup
curl -s https://api.webarmonium.app/api/metrics | grep rooms_cleaned
```

### Log Analysis

**1. Error Patterns:**
```bash
# Find gesture processing errors
grep "Gesture processing error" /var/log/webarmonium/combined.log

# WebSocket disconnection patterns
grep "Client disconnected" /var/log/webarmonium/combined.log | awk '{print $7}' | sort | uniq -c

# Memory cleanup issues
grep "Memory cleanup" /var/log/webarmonium/combined.log
```

**2. Performance Analysis:**
```bash
# Average response times
awk '/Processing time:/ {sum+=$3; count++} END {print "Average:", sum/count "ms"}' /var/log/webarmonium/combined.log

# Constitutional compliance violations
grep -c "exceeds.*constitutional requirement" /var/log/webarmonium/combined.log
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (unit, integration, performance)
- [ ] Constitutional requirements validated
- [ ] Security audit completed
- [ ] SSL certificates generated/renewed
- [ ] Environment variables configured
- [ ] Database migrations (if applicable)
- [ ] Static assets optimized and uploaded to CDN

### Deployment
- [ ] Deploy backend services
- [ ] Deploy frontend assets
- [ ] Configure load balancer/reverse proxy
- [ ] Verify SSL/TLS configuration
- [ ] Enable monitoring and alerting
- [ ] Run smoke tests

### Post-Deployment
- [ ] Monitor error rates and latency
- [ ] Verify WebSocket connections
- [ ] Test gesture processing performance
- [ ] Check memory usage and cleanup
- [ ] Validate constitutional compliance metrics
- [ ] Update monitoring dashboards

---

## 📞 Support

For deployment issues:

- **Documentation**: [docs/troubleshooting.md](troubleshooting.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/webarmonium/issues)
- **Community**: [GitHub Discussions](https://github.com/your-org/webarmonium/discussions)
- **Email**: deploy@webarmonium.app