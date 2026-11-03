# Imagem "tudo em um": API + worker + Banco Sandbox + tela web num container só.
# Usada no modo pessoal (docker-compose.pessoal.yml). Build:  docker build -t openwallet .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/openfinance-mock/package.json apps/openfinance-mock/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
# VITE_API_URL vazio: a tela chama a API no mesmo endereço.
RUN VITE_API_URL= npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/openfinance-mock/package.json apps/openfinance-mock/
RUN npm ci --omit=dev --no-audit --no-fund -w @openwallet/api -w @openwallet/tax -w @openwallet/openfinance-mock

FROM node:22-alpine
ENV NODE_ENV=production \
    UV_THREADPOOL_SIZE=8 \
    PORT=3000 \
    RUN_MIGRATIONS_ON_START=true \
    RUN_WORKER=true \
    SANDBOX_BANK=true \
    SERVE_WEB_DIR=apps/web/dist
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/tax/package.json packages/tax/
COPY --from=build /app/packages/tax/dist packages/tax/dist
COPY --from=build /app/packages/tax/data packages/tax/data
COPY --from=build /app/apps/openfinance-mock/package.json apps/openfinance-mock/
COPY --from=build /app/apps/openfinance-mock/dist apps/openfinance-mock/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]
