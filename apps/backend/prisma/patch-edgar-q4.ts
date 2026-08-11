import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const tickers = await prisma.ticker.findMany({
    select: { id: true, symbol: true, historicalEpsQuarterly: true },
  });

  let patchedCount = 0;

  for (const ticker of tickers) {
    const quarters: any[] = (ticker.historicalEpsQuarterly as any[]) || [];
    if (quarters.length === 0) continue;

    const undefinedOnes = quarters.filter(
      (q) => (!q.period || q.period === 'undefined') && q.epsDiluted !== undefined,
    );
    if (undefinedOnes.length === 0) continue;

    let patched = false;
    const patchedQuarters = quarters.map((q: any) => {
      if ((!q.period || q.period === 'undefined') && q.epsDiluted !== undefined && q.date) {
        const yr = parseInt(q.date.split('-')[0], 10);
        const fixed = {
          ...q,
          period: 'Q4',
          fiscalYear: String(yr),
          eps: q.eps ?? q.epsDiluted,
          revenue: q.revenue ?? 0,
          netIncome: q.netIncome ?? 0,
          sharesOutstanding: q.sharesOutstanding ?? 0,
        };
        console.log(`  [${ticker.symbol}] PATCH ${q.date} -> Q4 FY${yr} eps=${fixed.epsDiluted}`);
        patched = true;
        return fixed;
      }
      return q;
    });

    if (patched) {
      await prisma.ticker.update({
        where: { id: ticker.id },
        data: { historicalEpsQuarterly: patchedQuarters as any },
      });
      patchedCount++;
    }
  }

  console.log('\n=== PATCH COMPLETADO: ' + patchedCount + ' tickers corregidos ===');
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
