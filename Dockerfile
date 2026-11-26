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

# poppler-utils provides pdftoppm for reliable PDF-to-image rendering
RUN apk add --no-cache poppler-utils

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/db ./db
COPY --from=builder /app/assets ./assets

# Create persistent data directories
RUN mkdir -p /app/data/uploads /app/data/templates

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# All persistent data under /app/data (single Railway volume)
ENV DATABASE_PATH=/app/data/kyc.db
ENV UPLOAD_DIR=/app/data/uploads
ENV TEMPLATE_DIR=/app/data/templates

CMD ["node", "server.js"]
