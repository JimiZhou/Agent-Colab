# syntax=docker/dockerfile:1
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional public proxy CA is mounted for managed development environments only.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --strict-ssl=true
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_FILE=/app/data/colab.sqlite
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/skill ./packages/skill
COPY --chown=node:node package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/server/src/index.js"]
