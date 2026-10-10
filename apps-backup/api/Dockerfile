# Build context is the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production STORAGE_DIR=/data/invoices
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
# Pre-create the shared invoice folder with the right owner so the named volume inherits it.
RUN mkdir -p /data/invoices && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
