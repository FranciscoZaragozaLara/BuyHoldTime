-- Bonus simétrico WTI (ratio vs SMA36M: shock +10 / caro +5 / barato −5 / alivio −10) fuera del promedio base.
ALTER TABLE "bt_thermo_history" ADD COLUMN "oil_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bt_thermo_history" ADD COLUMN "oil_bonus_label" TEXT;
