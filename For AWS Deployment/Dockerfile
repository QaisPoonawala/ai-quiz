FROM node:18-alpine

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

WORKDIR /usr/src/app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Create directory for exports
RUN mkdir -p public/exports && chmod 777 public/exports

# Expose the application port
EXPOSE 5001

# Set default environment variables
ENV NODE_ENV=production \
    PORT=5001

# Start the application
CMD ["npm", "start"]
