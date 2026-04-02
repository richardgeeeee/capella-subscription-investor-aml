FROM node:20-alpine AS base

# Install dependencies for better-sqlite3 native build
RUN apk add --no-cache python3 make g++

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/db ./db

# Create persistent data directories
RUN mkdir -p /app/data /app/uploads /app/templates && \
    chown -R nextjs:nodejs /app/data /app/uploads /app/templates

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# SQLite and uploads use /app/data and /app/uploads (mount Railway volumes here)
ENV DATABASE_PATH=/app/data/kyc.db
ENV UPLOAD_DIR=/app/uploads
ENV TEMPLATE_DIR=/app/templates

CMD ["node", "server.js"]
