# Unified image for the single-container pos-system deployment.
FROM node:24-bookworm-slim AS api-build
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
COPY apps/api/.npmrc ./
COPY packages/invoice-store /packages/invoice-store
RUN npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS worker-build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY apps/pdf-worker/package.json apps/pdf-worker/package-lock.json ./
COPY apps/pdf-worker/.npmrc ./
COPY packages/invoice-store /packages/invoice-store
RUN npm ci --no-audit --no-fund
COPY apps/pdf-worker/tsconfig.json ./
COPY apps/pdf-worker/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS web-build
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY packages/shared-types /repo/packages/shared-types
COPY apps/web ./
RUN npm run build

FROM ghcr.io/ferretdb/ferretdb:2.7.0 AS gateway
FROM ghcr.io/ferretdb/postgres-documentdb:17-0.107.0-ferretdb-2.7.0 AS postgres-base
FROM postgres-base
COPY --from=gateway /ferretdb /usr/local/bin/ferretdb
COPY --from=api-build /usr/local/ /usr/local/
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    STORAGE_DIR=/data/invoices \
    REDIS_URL=redis://127.0.0.1:6379 \
    PGDATA=/var/lib/postgresql/data/cluster

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium curl nginx netcat-openbsd redis-server supervisor \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
COPY --from=postgres-base /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
WORKDIR /app
COPY --from=api-build /app/node_modules ./api/node_modules
COPY --from=api-build /app/dist ./api/dist
COPY --from=api-build /app/package.json ./api/package.json
COPY --from=worker-build /app/node_modules ./worker/node_modules
COPY --from=worker-build /app/dist ./worker/dist
COPY --from=worker-build /app/src/templates ./worker/src/templates
COPY --from=worker-build /app/package.json ./worker/package.json
COPY --from=web-build /repo/apps/web/dist /var/www/pos-system
COPY infra/nginx/single-container.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/pos-system.conf
COPY docker/entrypoint.sh /usr/local/bin/pos-system-entrypoint
COPY docker/healthcheck.sh /usr/local/bin/pos-healthcheck
COPY infra/postgres/init-pos.sh /docker-entrypoint-initdb.d/99-init-pos.sh
COPY infra/postgres/start-app.sh /usr/local/bin/start-pos-app
RUN groupadd --system node && useradd --system --gid node node \
 && useradd --system --user-group ferret \
 && chmod 0755 /usr/local/bin/pos-system-entrypoint /usr/local/bin/pos-healthcheck /usr/local/bin/start-pos-app /docker-entrypoint-initdb.d/99-init-pos.sh \
 && install -d -m 0755 /app/backups

COPY infra/postgres/provision-businesses.cjs /app/api/provision-businesses.cjs
COPY infra/postgres/business-hba.conf /etc/pos-pg-hba.conf
ENV BUSINESS_DB_DIRECTORY=/run/pos/businesses
ENV POS_DOCUMENT_URI_FILE=/run/pos/app-uri
EXPOSE 8080
VOLUME ["/data/redis", "/data/invoices", "/app/backups"]
HEALTHCHECK --interval=20s --timeout=5s --start-period=120s --retries=5 \
  CMD /usr/local/bin/pos-healthcheck
ENTRYPOINT ["/usr/local/bin/pos-system-entrypoint"]
