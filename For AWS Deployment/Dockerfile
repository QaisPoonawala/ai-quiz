# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:18-alpine

# Install Redis client
RUN apk add --no-cache redis

# Create app directory
WORKDIR /app

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built artifacts from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application files
COPY server.js ./
COPY config/ ./config/
COPY controllers/ ./controllers/
COPY models/ ./models/
COPY routes/ ./routes/
COPY public/ ./public/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5001

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Start the application
CMD ["node", "server.js"]
