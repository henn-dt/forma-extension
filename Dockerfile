# =============================================================================
# MULTI-STAGE BUILD: React Frontend + Express Backend
# =============================================================================
# Stage 1: Build the React frontend
# Stage 2: Production server with Express serving built React app
# =============================================================================

# =============================================================================
# STAGE 1: Build React Frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder

# Build arguments for frontend environment variables
# These are injected at build time for Vite to embed in the bundle
ARG VITE_MAPBOX_TOKEN
ARG VITE_API_BASE_URL

# Set as environment variables so Vite can access them during build
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

WORKDIR /app

# Copy package files for frontend
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code needed for build
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/

# Build the React app (VITE_* env vars are embedded during this step)
RUN npm run build

# Verify build output
RUN ls -la dist/

# =============================================================================
# STAGE 2: Production Backend Server
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/index.js ./
COPY backend/auth-setup.js ./
COPY backend/passport-config.js ./
COPY backend/routes/ ./routes/
COPY backend/services/ ./services/
COPY backend/middleware/ ./middleware/

# Copy built React app from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy public folder (login pages, static assets)
COPY public/ ./public/

# Copy Python tree model (needed for GLB serving)
COPY python_backend/tree_model/ ./python_backend/tree_model/

# Add CA certificates for HTTPS requests (needed for Directus, Mapbox, etc.)
RUN apk add --no-cache ca-certificates && update-ca-certificates

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port Express listens on
EXPOSE 3001

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check - verifies the server is responding
# Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues in Alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://127.0.0.1:3001/health || exit 1

# Start the Express server
CMD ["node", "index.js"]
