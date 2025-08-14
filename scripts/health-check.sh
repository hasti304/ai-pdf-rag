#!/bin/bash

echo "🏥 AI PDF RAG Chatbot Health Check"
echo "=================================="

# Check if containers are running
echo "📦 Container Status:"
docker-compose ps

echo ""
echo "🌐 Service Health Checks:"

# Check main application
if curl -s http://localhost/health > /dev/null; then
    echo "✅ Main Application: HEALTHY"
else
    echo "❌ Main Application: DOWN"
fi

# Check Grafana
if curl -s http://localhost:3001 > /dev/null; then
    echo "✅ Grafana Dashboard: HEALTHY"
else
    echo "❌ Grafana Dashboard: DOWN"
fi

# Check Prometheus
if curl -s http://localhost:9090 > /dev/null; then
    echo "✅ Prometheus Metrics: HEALTHY"
else
    echo "❌ Prometheus Metrics: DOWN"
fi

echo ""
echo "💾 Storage Usage:"
df -h | grep -E "(Filesystem|/dev/)"

echo ""
echo "🧠 Memory Usage:"
free -h

echo ""
echo "⚡ Docker Stats:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
