# Base image
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install necessary dependencies for Prisma and SSL
RUN apk add --no-cache libc6-compat openssl openssl-dev
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma

# Build the application
RUN npm run build:api

# Production image, copy all the files and run the application
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl for health checks and SSL libraries for Prisma
RUN apk add --no-cache curl openssl openssl-dev

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma

# Copy Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nestjs

EXPOSE 3001

ENV PORT=3001

CMD ["node", "dist/main"]
