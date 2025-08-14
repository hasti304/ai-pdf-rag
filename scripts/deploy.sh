#!/bin/bash
set -e

echo "🚀 Deploying AI PDF RAG Chatbot to Production..."

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | xargs)
fi

# Build and deploy with Docker Compose
echo "📦 Building Docker containers..."
docker-compose -f docker-compose.yml build --no-cache

echo "🔄 Starting services..."
docker-compose -f docker-compose.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo "🏥 Checking service health..."
docker-compose -f docker-compose.yml ps

# Test deployment
echo "🧪 Testing deployment..."
curl -f http://localhost/health || (echo "❌ Health check failed" && exit 1)

echo "✅ Deployment completed successfully!"
echo "🌐 Application available at: http://localhost"
echo "📊 Grafana dashboard: http://localhost:3001 (admin/admin123)"
echo "📈 Prometheus metrics: http://localhost:9090"
