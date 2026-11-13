# For release builds set NODE_IMAGE to an approved official image digest.
ARG NODE_IMAGE=node:24-bookworm-slim
ARG CADDY_IMAGE=caddy:2-alpine
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/money/package.json packages/money/package.json
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY packages packages
COPY apps/api apps/api
RUN npm run build:backend
RUN npm prune --omit=dev --ignore-scripts

FROM dependencies AS web-build
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build -w @huoyoupu/contracts && npm run build:web

FROM ${CADDY_IMAGE} AS web
COPY --from=web-build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile

# Keep the default build target as the backend runtime; build --target web separately.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node infra/runtime.mjs /app/infra/runtime.mjs
USER node
EXPOSE 3000
CMD ["node","infra/runtime.mjs","serve"]
