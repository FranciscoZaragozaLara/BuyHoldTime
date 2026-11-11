-- CreateTable
CREATE TABLE "bt_bht_forward" (
    "date" DATE NOT NULL,
    "bht_value" DOUBLE PRECISION,
    "spx" DOUBLE PRECISION,
    "ndx" DOUBLE PRECISION,
    "tqqq" DOUBLE PRECISION,
    "spx_1y" DOUBLE PRECISION,
    "spx_2y" DOUBLE PRECISION,
    "spx_3y" DOUBLE PRECISION,
    "spx_5y" DOUBLE PRECISION,
    "ndx_1y" DOUBLE PRECISION,
    "ndx_2y" DOUBLE PRECISION,
    "ndx_3y" DOUBLE PRECISION,
    "ndx_5y" DOUBLE PRECISION,
    "tqqq_1y" DOUBLE PRECISION,
    "tqqq_2y" DOUBLE PRECISION,
    "tqqq_3y" DOUBLE PRECISION,
    "tqqq_5y" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_bht_forward_pkey" PRIMARY KEY ("date")
);
