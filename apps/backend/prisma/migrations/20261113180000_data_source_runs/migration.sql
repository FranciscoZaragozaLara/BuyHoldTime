-- Monitor de frescura, fase 2: una fila por corrida de extracción de cada fuente.
-- source = id de la fuente en src/modules/admin/data-freshness.ts; process = quién corrió
-- (daily_update.py, market-sync stream, ticker-sync, edgar, gurufocus…).
CREATE TABLE IF NOT EXISTS "data_source_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" TEXT NOT NULL,
  "process" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL,
  "finished_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "status" TEXT NOT NULL,
  "rows" INTEGER,
  "message" TEXT,
  CONSTRAINT "data_source_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_source_runs_status_check" CHECK ("status" IN ('ok', 'partial', 'error'))
);
CREATE INDEX IF NOT EXISTS "data_source_runs_source_started_idx" ON "data_source_runs" ("source", "started_at" DESC);
