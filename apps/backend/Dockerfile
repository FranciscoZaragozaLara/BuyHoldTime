# syntax=docker/dockerfile:1
# Contexto de build: raíz del monorepo  (docker build -f apps/backend/Dockerfile .)
FROM node:22-bookworm-slim

# openssl (motor de migraciones de Prisma), tini (PID 1) y certificados
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Python de los scripts de backtesting: el mismo CPython 3.11.x que usa el entorno de desarrollo
# (uv lo descarga; el Python de Debian es 3.11.2 y algunas dependencias exigen >= 3.11.5).
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_PYTHON_PREFERENCE=only-managed
COPY apps/backend/docker/python-requirements.txt /tmp/python-requirements.txt
RUN uv venv --python 3.11 /opt/venv \
 && uv pip install --python /opt/venv/bin/python -r /tmp/python-requirements.txt \
 && rm /usr/local/bin/uv
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
    SHILLER_XLS=/data/shiller-ie-data.xls \
    SHILLER_DATA_DIR=/data
USER node
EXPOSE 4000

# Aplica migraciones (si fallan, el contenedor no arranca), genera en segundo plano los CSV
# de Shiller que faltan y arranca la API (una sola réplica).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "pnpm exec prisma migrate deploy || exit 1; (sh docker/bootstrap-shiller.sh &); exec node dist/src/main"]
