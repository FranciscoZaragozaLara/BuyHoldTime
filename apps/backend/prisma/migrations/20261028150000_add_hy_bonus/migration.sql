-- Bonus asimétrico HY OAS (Régimen 3: +5 armado / +10 G1 / +20 G2) fuera del promedio base.
ALTER TABLE "bt_thermo_history" ADD COLUMN "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bt_thermo_history" ADD COLUMN "bonus_label" TEXT;
