import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * SALVAGUARDA: serie mensual de PE real en ETFs (VOO/SPY/QQQ/TQQQ).
 * Estos fondos usan entradas mensuales M% (multpl S&P 500 / Nasdaq-100),
 * NO trimestres generados por promedio sectorial. El sync-tickers debe
 * conservarlas (manuallySeeded) y nunca reemplazarlas por filas Q%.
 * Regresión: Sep-2026 — VOO mostraba PE 45.90/EPS 15.25 (proxy sectorial)
 * en vez de PE ~26.1/EPS ~27 (multpl mensual real).
 */

describe("ETF Monthly PE Series Protection Suite", () => {
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

  const monthlySeeds = ["VOO", "SPY", "QQQ", "TQQQ"];

  test.each(monthlySeeds)("serie mensual intacta y vigente para %s", async (symbol) => {
    const ticker = await prisma.ticker.findFirst({ where: { symbol } });
    expect(ticker).toBeDefined();

    const quarters = (ticker?.historicalEpsQuarterly as any[]) || [];
    expect(quarters.length).toBeGreaterThan(100);

    // Cero filas trimestrales generadas (proxy sectorial): todo debe ser mensual M%
    const quarterlyRows = quarters.filter((q) => /^Q[1-4]$/.test(q.period));
    expect(quarterlyRows).toEqual([]);

    // Cobertura reciente: último mes completo dentro de ~95 días
    const dates = quarters.map((q) => new Date(q.date).getTime());
    const maxDate = new Date(Math.max(...dates));
    const ageDays = (Date.now() - maxDate.getTime()) / 86400000;
    expect(ageDays).toBeLessThan(95);

    // PE reales positivos en las 3 entradas más recientes
    const newest = [...quarters].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ).slice(0, 3);
    for (const q of newest) {
      expect(q.peRatio).toBeGreaterThan(5);
      expect(q.peRatio).toBeLessThan(100);
    }
  });
});
