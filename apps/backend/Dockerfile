# syntax=docker/dockerfile:1
# Contexto de build: raíz del monorepo  (docker build -f apps/backend/Dockerfile .)
FROM node:22-bookworm-slim

# Python (scripts de backtesting), openssl (motor de migraciones de Prisma) y tini (PID 1)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

COPY apps/backend/docker/python-requirements.txt /tmp/python-requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r /tmp/python-requirements.txt
ENV PATH="/opt/venv/bin:${PATH}"

RUN npm install -g pnpm@11.4.0

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/bht-bands/package.json packages/bht-bands/package.json
# El raíz (".") aporta dotenv, que usa prisma.config.ts
RUN pnpm install --frozen-lockfile --filter "backend..." --filter "."

COPY apps/backend apps/backend
COPY packages/bht-bands packages/bht-bands

WORKDIR /repo/apps/backend
# generate no abre la base; la URL es solo para que prisma.config.ts cargue
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm exec prisma generate \
 && pnpm run build \
 && mkdir -p /data \
 && chown -R node:node /repo /data

ENV NODE_ENV=production \
    PORT=4000 \
    BACKTEST_DIR=/opt/backtesting \
    SHILLER_XLS=/data/shiller-ie-data.xls
USER node
EXPOSE 4000

# Aplica migraciones (si fallan, el contenedor no arranca), genera en segundo plano los CSV
# de Shiller que faltan y arranca la API (una sola réplica).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "pnpm exec prisma migrate deploy || exit 1; (sh docker/bootstrap-shiller.sh &); exec node dist/src/main"]
