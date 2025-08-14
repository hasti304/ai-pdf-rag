#!/bin/bash
set -e

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "💾 Creating backup at $BACKUP_DIR..."

# Backup PostgreSQL database
echo "📊 Backing up PostgreSQL database..."
docker-compose exec -T postgres pg_dump -U postgres ai_pdf_chatbot | gzip > "$BACKUP_DIR/postgres_backup.sql.gz"

# Backup Redis data
echo "🔄 Backing up Redis data..."
docker-compose exec -T redis redis-cli --rdb /tmp/dump.rdb
docker cp $(docker-compose ps -q redis):/tmp/dump.rdb "$BACKUP_DIR/redis_dump.rdb"

# Backup uploaded files
echo "📁 Backing up uploaded files..."
tar -czf "$BACKUP_DIR/uploads.tar.gz" ./uploads/

# Backup logs
echo "📝 Backing up logs..."
tar -czf "$BACKUP_DIR/logs.tar.gz" ./logs/

# Backup environment configuration
echo "⚙️ Backing up configuration..."
cp .env.production "$BACKUP_DIR/env_backup"

echo "✅ Backup completed: $BACKUP_DIR"
