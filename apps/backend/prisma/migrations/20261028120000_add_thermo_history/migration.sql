-- CreateTable
CREATE TABLE "bt_thermo_history" (
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "numerator" DOUBLE PRECISION NOT NULL,
    "denominator" DOUBLE PRECISION NOT NULL,
    "coverage" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_thermo_history_pkey" PRIMARY KEY ("date")
);
