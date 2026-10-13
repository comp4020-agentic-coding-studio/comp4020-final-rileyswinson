# syntax = docker/dockerfile:1

# A small Node server: it serves public/, renders README.md at /readme/, and
# carries the live door state over a WebSocket at /live. Node runs the
# TypeScript directly, so there's no build step.

FROM docker.io/library/node:24.21.0-alpine
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY server/ server/
COPY public/ public/
COPY README.md ./
ENV NODE_ENV=production
ENV DATA_DIR=/data
CMD ["node", "server/server.ts"]
