import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * SALVAGUARDA: serie mensual de EPS TTM del S&P 500 (columna E de Shiller, daily_update.py) en bt_market_data.
 * La columna SPX EPS de la tabla de indicadores (antes de CAPE) depende de
 * este ticker. Lo carga daily_update.py (sync_spx_eps); prisma/seed-sp500-eps-monthly.ts (multpl) queda como respaldo manual.
 */

describe("SPX EPS Monthly Series Suite", () => {
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

  it("existe serie mensual SPX_EPS con cobertura histórica", async () => {
    const n = await prisma.btMarketData.count({ where: { ticker: "SPX_EPS" } });
    expect(n).toBeGreaterThan(1000);
  });

  it("último dato vigente (rezago publicación ~1 trimestre)", async () => {
    const last: any = await prisma.btMarketData.findFirst({
      where: { ticker: "SPX_EPS" },
      orderBy: { date: "desc" },
    });
    expect(last).toBeDefined();
    const ageDays = (Date.now() - new Date(last.date).getTime()) / 86400000;
    expect(ageDays).toBeLessThan(150);
    expect(last.close).toBeGreaterThan(100);
    expect(last.close).toBeLessThan(600);
  });
});
