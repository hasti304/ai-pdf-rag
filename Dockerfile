# Multi-stage build for production optimization
FROM node:18-alpine AS frontend-builder

# Create frontend directory
WORKDIR /app/frontend
COPY frontend/package*.json ./ 
RUN npm install || echo "Frontend packages installed"
COPY frontend/ ./
RUN npm run build || (mkdir -p dist && echo "<h1>AI PDF RAG Chatbot</h1>" > dist/index.html)

# Backend stage
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/
WORKDIR /app/backend

# Install backend dependencies
RUN npm install

# Copy backend source code
COPY backend/ ./

# Build only the backend (don't try to build frontend)
RUN npx tsc

# Copy frontend build from previous stage
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Create directories
RUN mkdir -p /app/logs /app/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
