import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * SALVAGUARDA: serie de Forward 12m EPS del S&P 500 (operating, consenso) en bt_market_data.
 * La columna Fwd PE de la tabla de indicadores (después de PE, antes de CAPE) depende de
 * este ticker: Fwd PE = precio SPX / SPX_FWD_EPS.
 * Seed: prisma/seed-sp500-fwdeps.ts (fuente: source/sp500-forward-eps.csv, actualizar cada trimestre
 * desde el Excel S&P "S&P 500 EPS Estimates"). Sin historia hacia atrás: solo hacia adelante.
 */

describe("SPX Forward EPS Series Suite", () => {
  let pool: Pool;
  let adapter: PrismaPg;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it("existe serie SPX_FWD_EPS", async () => {
    const n = await prisma.btMarketData.count({ where: { ticker: "SPX_FWD_EPS" } });
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it("último dato vigente (actualización trimestral)", async () => {
    const last: any = await prisma.btMarketData.findFirst({
      where: { ticker: "SPX_FWD_EPS" },
      orderBy: { date: "desc" },
    });
    expect(last).toBeDefined();
    const ageDays = (Date.now() - new Date(last.date).getTime()) / 86400000;
    expect(ageDays).toBeLessThan(150);
    expect(last.close).toBeGreaterThan(100);
    expect(last.close).toBeLessThan(1000);
  });
});
