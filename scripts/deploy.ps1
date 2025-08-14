Write-Host "🚀 Deploying AI PDF RAG Chatbot to Production..." -ForegroundColor Green

# Load environment variables from .env.production
if (Test-Path ".env.production") {
    Get-Content ".env.production" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

Write-Host "📦 Building Docker containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml build --no-cache

Write-Host "🔄 Starting services..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml up -d

Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "🏥 Checking service health..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml ps

Write-Host "🧪 Testing deployment..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Health check passed!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Health check failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host "🌐 Application available at: http://localhost" -ForegroundColor Cyan
Write-Host "📊 Grafana dashboard: http://localhost:3001 (admin/admin123)" -ForegroundColor Cyan
Write-Host "📈 Prometheus metrics: http://localhost:9090" -ForegroundColor Cyan
