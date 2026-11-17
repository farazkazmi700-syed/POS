# Build context is the repo root:  docker build -f apps/pdf-worker/Dockerfile .
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY apps/pdf-worker/package.json apps/pdf-worker/package-lock.json ./
COPY apps/pdf-worker/.npmrc ./
COPY packages/invoice-store /packages/invoice-store
RUN npm ci --no-audit --no-fund
COPY apps/pdf-worker/tsconfig.json ./
COPY apps/pdf-worker/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    STORAGE_DIR=/data/invoices
# Chromium from Alpine (smaller and more reliable than puppeteer's own download) + fonts
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/templates ./src/templates
COPY --from=build /app/package.json ./
RUN mkdir -p /data/invoices && chown -R node:node /data
USER node
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD pgrep -f "node dist/worker" > /dev/null || exit 1
CMD ["node", "dist/worker.js"]
