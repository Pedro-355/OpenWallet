# Build a partir da raiz do repositório:  docker build -f apps/openfinance-mock/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/openfinance-mock/package.json apps/openfinance-mock/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY apps/openfinance-mock apps/openfinance-mock
RUN npm run build -w @openwallet/openfinance-mock

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tax/package.json packages/tax/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/openfinance-mock/package.json apps/openfinance-mock/
RUN npm ci --omit=dev --no-audit --no-fund -w @openwallet/openfinance-mock
COPY --from=build /app/apps/openfinance-mock/dist apps/openfinance-mock/dist
USER node
EXPOSE 4000
CMD ["node", "apps/openfinance-mock/dist/server.js"]
