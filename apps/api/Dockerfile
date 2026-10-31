# Build a partir da raiz do repositório:  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/tax packages/tax
COPY apps/api apps/api
RUN npm run build -w @openwallet/tax && npm run build -w @openwallet/api

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w @openwallet/api -w @openwallet/tax

FROM node:22-alpine
ENV NODE_ENV=production \
    # scrypt (hash de senha) roda no threadpool do libuv; mais threads = mais logins em paralelo.
    UV_THREADPOOL_SIZE=8
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/tax/package.json packages/tax/
COPY --from=build /app/packages/tax/dist packages/tax/dist
COPY --from=build /app/packages/tax/data packages/tax/data
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/migrations apps/api/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]
