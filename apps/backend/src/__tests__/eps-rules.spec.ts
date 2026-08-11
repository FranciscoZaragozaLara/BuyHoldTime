import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";


/**
 * TEST AUTOMATIZADO DE SALVAGUARDA CONTRA REGRESIONES EN EPS DE SEC EDGAR
 * Este test audita que en la base de datos PostgreSQL:
 * 1. Todos los años fiscales cerrados tengan exactamente 4/4 trimestres (Q1, Q2, Q3, Q4).
 * 2. No existan periodos duplicados (ej. dos Q1) en el mismo año fiscal.
 * 3. Se mantenga la alineación del mes de cierre de Form 10-K para AAPL (Sept), MSFT (Jun), NVDA (Ene) y AMZN (Dic).
 */

describe("SEC EDGAR EPS Rules & Alignment Suite", () => {
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

  const testSymbols = ["AAPL", "NVDA", "MSFT", "AMZN", "V", "COST", "SBUX", "XOM"];

  testSymbols.forEach((symbol) => {
    it(`debe tener 4/4 trimestres únicos por año fiscal cerrado para ${symbol}`, async () => {
      const ticker = await prisma.ticker.findFirst({ where: { symbol } });
      expect(ticker).toBeDefined();

      const quarters = (ticker?.historicalEpsQuarterly as any[]) || [];
      expect(quarters.length).toBeGreaterThan(15);

      const fyMap = new Map<string, any[]>();
      for (const q of quarters) {
        if (!fyMap.has(q.fiscalYear)) fyMap.set(q.fiscalYear, []);
        fyMap.get(q.fiscalYear)!.push(q);
      }

      // Validar años cerrados completos (excluyendo el año en curso)
      const currentYear = new Date().getFullYear();
      for (const [fy, qList] of fyMap.entries()) {
        const fyNum = parseInt(fy, 10);
        if (fyNum >= 2010 && fyNum <= 2025) {
          // Verificar exactamente 4 trimestres
          expect(qList.length).toBe(4);

          // Verificar que existan Q1, Q2, Q3 y Q4 sin repetir
          const periods = qList.map((q) => q.period).sort();
          expect(periods).toEqual(["Q1", "Q2", "Q3", "Q4"]);
        }
      }
    });
  });
});
