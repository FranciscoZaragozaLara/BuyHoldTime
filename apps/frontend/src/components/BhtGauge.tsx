import { BHT_BANDS } from '@/components/backtesting/bhtBands';
import { GAUGE, gaugeAngle, gaugeArc, gaugePolar } from '@/lib/bhtGauge';

// Medidor semicircular del BHT Index (estilo Fear & Greed). Sin estado: sirve en componentes de servidor
// (home) y de cliente (Indicadores).
export function BhtGauge({ score, ariaLabel, className = 'w-full max-w-[440px]' }: { score: number; ariaLabel: string; className?: string }) {
  const { CX, CY, R } = GAUGE;
  const [nx, ny] = gaugePolar(gaugeAngle(score), R - 24);
  const [t0x, t0y] = gaugePolar(gaugeAngle(0), R + 12);
  const [t50x, t50y] = gaugePolar(gaugeAngle(50), R + 12);
  const [t100x, t100y] = gaugePolar(gaugeAngle(100), R + 12);
  return (
    <svg viewBox="0 0 200 118" className={className} role="img" aria-label={ariaLabel}>
      {BHT_BANDS.map((b) => <path key={b.lo} d={gaugeArc(b.lo + 0.8, b.hi - 0.8)} fill="none" stroke={b.color} strokeWidth="16" strokeLinecap="butt" opacity="0.85" />)}
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r="6" fill="#e2e8f0" />
      <text x={t0x.toFixed(0)} y={t0y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="start">0</text>
      <text x={t50x.toFixed(0)} y={t50y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">50</text>
      <text x={t100x.toFixed(0)} y={t100y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">100</text>
    </svg>
  );
}
