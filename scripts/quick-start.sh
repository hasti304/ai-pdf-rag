#!/bin/bash
set -e

echo "🚀 AI PDF RAG Chatbot - Quick Start"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ .env.production file not found. Please create it first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Load environment variables
export $(cat .env.production | sed 's/#.*//g' | xargs)

echo "📦 Building and starting services..."
docker-compose up -d --build

echo "⏳ Waiting for services to initialize..."
sleep 45

echo "🧪 Running health checks..."
./scripts/health-check.sh

echo ""
echo "🎉 AI PDF RAG Chatbot is ready!"
echo "================================="
echo "🌐 Main Application: http://localhost"
echo "📊 Grafana Dashboard: http://localhost:3001"
echo "   Username: admin"
echo "   Password: admin123"
echo "📈 Prometheus Metrics: http://localhost:9090"
echo ""
echo "📝 To view logs: docker-compose logs -f"
echo "🛑 To stop services: docker-compose down"
echo "💾 To backup data: ./scripts/backup.sh"
