import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import { capeScoreColor } from '@/components/backtesting/bhtBands';
import { formatPartValue, HOME_BONUSES, HOME_PART_GROUPS, indicatorsHref } from '@/lib/homeThermo';
import type { ThermoToday } from '@/services/api';

// Los 12 componentes del termómetro agrupados, con puntaje de color y enlace a su tarjeta en Indicadores,
// más los ajustes fuera del promedio (crédito, liquidez, petróleo).
export async function HomeThermoParts({ locale, thermo }: { locale: string; thermo: ThermoToday }) {
  const t = await getTranslations({ locale, namespace: 'Home' });
  const byKey = new Map(thermo.parts.map((p) => [p.key, p]));
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white">{t('componentsTitle')}</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t('componentsSubtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {HOME_PART_GROUPS.map((g) => (
          <div key={g.key} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t(`groups.${g.key}`)}</h3>
            <ul className="flex flex-col gap-1">
              {g.parts.map(({ key, anchor }) => {
                const p = byKey.get(key);
                if (!p) return null;
                const s = Math.round(p.score);
                const c = capeScoreColor(p.score);
                return (
                  <li key={key}>
                    <Link href={indicatorsHref(locale, anchor)} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-900 transition">
                      <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-mono text-xs font-extrabold text-slate-950" style={{ background: c, boxShadow: `0 0 10px ${c}55` }}>{s}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-100 truncate">{t(`parts.${key}`)}</span>
                        <span className="block text-[11px] text-slate-500 font-mono">{formatPartValue(key, p.value)} · {t('weight', { w: p.weight })}</span>
                      </span>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-accent-400 transition" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 font-semibold">{t('bonusTitle')}:</span>
        {HOME_BONUSES.map(({ key, anchor }) => {
          const b = thermo[key].bonus;
          const cls = b > 0 ? 'border-elevated-500/40 bg-elevated-500/10 text-elevated-300' : b < 0 ? 'border-favorable-500/40 bg-favorable-500/10 text-favorable-300' : 'border-slate-700 bg-slate-900 text-slate-400';
          return (
            <Link key={key} href={indicatorsHref(locale, anchor)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold hover:brightness-125 transition ${cls}`}>
              {t(`bonuses.${key}`)} <span className="font-mono">{b === 0 ? t('bonusNone') : `${b > 0 ? '+' : ''}${b}`}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
