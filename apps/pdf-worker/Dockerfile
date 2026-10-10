# Build context is the repo root:  docker build -f apps/pdf-worker/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY apps/pdf-worker/package.json apps/pdf-worker/package-lock.json ./
RUN npm ci
COPY apps/pdf-worker/tsconfig.json ./
COPY apps/pdf-worker/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
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
CMD ["node", "dist/worker.js"]
