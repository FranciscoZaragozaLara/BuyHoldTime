// Estudio (adoptado: CREDIT_CFG.maxOff = 0.10): la divergencia crédito-bolsa (CREDIT_CFG) se activó en QQQ del 7-may al 5-jun-2020, con el HY ya 20–30% bajo
// su pico de marzo y el BHT en 0–5 (rebote post-COVID, no un 2007). Filtro probado: el HY debe seguir cerca de su
// máximo de 63 días (maxOff = qué tanto puede estar debajo). Compara: rachas de divergencia, ventas por crédito,
// episodios de compra afectados y CAGR del sistema 1× (VOO desde 1993-06, QQQ desde 1999-03).
//   npx ts-node prisma/credit-div-study.ts
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeSellTranches, computeTranches, creditAt, loadTrancheSeries, prepareTranches, type EpisodeSummary, type SellEvent } from '../src/modules/backtesting/tranches';
import { systemSince } from '../src/modules/backtesting/reentry';

const VARIANTS: Array<{ name: string; maxOff: number | null }> = [
  { name: 'Actual (sin filtro)', maxOff: null },
  { name: 'HY ≤ 5% bajo máx. 63d', maxOff: 0.05 },
  { name: 'HY ≤ 10% bajo máx. 63d', maxOff: 0.10 },
  { name: 'HY ≤ 15% bajo máx. 63d', maxOff: 0.15 },
];
const ROUTES = [['voo', '1993-06-01'], ['qqq', '1999-03-10']] as const;

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const last = s.dates[s.dates.length - 1];
  for (const [route, from] of ROUTES) {
    console.log(`\n================ ${route.toUpperCase()}`);
    for (const v of VARIANTS) {
      const P = prepareTranches(s, route, { maxOff: v.maxOff });
      // Rachas de divergencia (días seguidos, huecos ≤ 5 sesiones) con HY y BHT al inicio.
      const runs: string[] = [];
      let a = -1, b = -1;
      const flush = () => { if (a < 0) return; const c = creditAt(P, a); runs.push(`${s.dates[a]}→${s.dates[b].slice(5)} (HY ${c.oas?.toFixed(2)}, ${c.fromMax63?.toFixed(0)}% vs máx63, BHT ${s.bht?.[a]?.toFixed(0) ?? '—'})`); };
      P.credDiv.forEach((d, k) => { if (!d) return; if (a >= 0 && k - b <= 5) b = k; else { flush(); a = b = k; } });
      flush();
      const crisisDays = s.dates.reduce((n, _, k) => n + (creditAt(P, k).crisis ? 1 : 0), 0);
      const sales: SellEvent[] = [];
      computeSellTranches(P, last, (e) => sales.push(e));
      const eps: EpisodeSummary[] = [];
      computeTranches(P, last, 'half', { onEpisodeEnd: (e) => eps.push(e) });
      const sys = systemSince(P, from)!;
      const yrs = (Date.parse(sys.today) - Date.parse(sys.from)) / (365.25 * 864e5);
      const cagr = ((1 + sys.system.pct / 100) ** (1 / yrs) - 1) * 100;
      console.log(`\n${v.name}: CAGR ${cagr.toFixed(2)}% · caída máx ${sys.system.maxDd.pct.toFixed(1)}% · días en crisis ${crisisDays}`);
      console.log(`  divergencias: ${runs.join(' · ') || '—'}`);
      console.log(`  ventas por crédito: ${sales.filter((e) => e.credit).map((e) => `${e.id}@${e.date}`).join(' ') || '—'}`);
      console.log(`  episodios con captura: ${eps.filter((e) => e.ddMax <= -15).map((e) => `${e.start.slice(0, 7)} ${e.captured?.toFixed(0) ?? '—'}%`).join(' · ')}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
