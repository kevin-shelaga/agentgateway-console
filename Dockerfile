# agentgateway-console — multi-stage build to a minimal standalone server.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S agc && adduser -S agc -G agc
COPY --from=build --chown=agc:agc /app/.next/standalone ./
COPY --from=build --chown=agc:agc /app/.next/static ./.next/static
COPY --from=build --chown=agc:agc /app/public ./public
USER agc
EXPOSE 3000
CMD ["node", "server.js"]
