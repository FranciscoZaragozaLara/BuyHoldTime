import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Activity } from 'lucide-react';
import { BhtGauge } from '@/components/BhtGauge';
import { TrendBadge } from '@/components/backtesting/TrendBadge';
import { BHT_BANDS, bhtBand } from '@/components/backtesting/bhtBands';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { indicatorsHref } from '@/lib/homeThermo';
import { getBhtMatrices5y, type ThermoToday } from '@/services/api';
import { BhtReturnsTable } from '@/components/BhtReturnsTable';

// Tarjeta principal de la home: medidor BHT, banda actual con su sugerencia, escala de bandas y accesos
// al detalle en Indicadores.
export async function HomeThermoCard({ locale, thermo }: { locale: string; thermo: ThermoToday }) {
  const t = await getTranslations({ locale, namespace: 'Home' });
  const ti = await getTranslations({ locale, namespace: 'Backtesting.indicators' });
  const score = Math.round(thermo.value * 10) / 10;
  const band = bhtBand(score);
  const bi = BHT_BANDS.indexOf(band);
  // Rendimientos históricos de la combinación de hoy (BHT × tendencia), últimos 5 años.
  const matrices = thermo.trend?.regime ? await getBhtMatrices5y(thermo.date) : null;
  const date = new Date(`${thermo.date}T12:00:00Z`).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="relative rounded-3xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 sm:p-7 shadow-2xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: band.color }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent-400"><Activity size={13} /> {t('thermoKicker')}</div>
          <h2 className="text-lg font-bold text-white mt-0.5">{t('thermoTitle')}</h2>
          <p className="text-[11px] text-slate-500">{t('thermoUpdated', { date })}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
        <BhtGauge score={score} className="w-full max-w-[260px] shrink-0" ariaLabel={ti('riskAria', { score, label: ti(`bht.b${bi}.label`) })} />
        <div className="text-center sm:text-left">
          <div className="font-mono text-6xl font-black text-white leading-none">{score.toFixed(1)}<span className="text-lg text-slate-500 font-bold">/100</span></div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold text-slate-950" style={{ background: band.color }}>{ti(`bht.b${bi}.label`)}</div>
          {/* Régimen tendencial del S&P 500 (SMA 50/200), acompañando a la banda del BHT. */}
          {thermo.trend && <div className="mt-2"><TrendBadge trend={thermo.trend} size="sm" /></div>}
          <p className="text-[11px] text-slate-500 mt-2">{t('thermoScale')}</p>
        </div>
      </div>

      {/* Escala de bandas con la actual resaltada */}
      <div className="mt-5 grid grid-cols-5 gap-1" aria-hidden>
        {BHT_BANDS.map((b, i) => (
          <div key={b.lo} className={`rounded-md px-1 py-1.5 text-center transition ${i === bi ? 'ring-2 ring-white/70' : 'opacity-50'}`} style={{ background: `${b.color}33` }}>
            <div className="h-1 rounded-full mb-1" style={{ background: b.color }} />
            <div className="text-[10px] font-mono text-slate-300">{b.range}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border p-3" style={{ borderColor: `${band.color}55`, background: `${band.color}12` }}>
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: band.color }}>{t('thermoAdviceTitle')}</div>
        <p className="text-sm text-slate-200 leading-relaxed mt-1">{ti(`bht.b${bi}.advice`)}</p>
      </div>

      {matrices && <BhtReturnsTable locale={locale} date={thermo.date} score={score} regime={thermo.trend?.regime ?? null} initial={matrices} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={indicatorsHref(locale, 'bht-hoy')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-slate-950 bg-accent-400 hover:bg-accent-300 transition">
          {t('thermoDetail')} <ArrowRight size={15} />
        </Link>
      </div>
      <RiskDisclaimer variant="signal" className="mt-3" />
    </div>
  );
}
