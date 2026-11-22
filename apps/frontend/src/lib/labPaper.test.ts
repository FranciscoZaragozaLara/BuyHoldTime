import { describe, expect, it } from 'vitest';
import { pnlByStrategy, positionPnl, sparkPath, type PaperPosition } from './labPaper';

const base: PaperPosition = { id: '1', strategy: 'canary_put', tranche: '2026-11-01', underlying: 'X', legs: [{ qty: 1 }], opened_at: '2026-11-21', entry_price: 2, status: 'open', exit_price: null, mark_conservative: 3, roi_pct: 50, exit_reason: null };

describe('labPaper', () => {
  it('P&L de opciones ×100 por contrato y del benchmark TQQQ en valor total', () => {
    expect(positionPnl(base)).toBe(100);
    expect(positionPnl({ ...base, legs: [{ qty: 3 }] })).toBe(300);
    expect(positionPnl({ ...base, status: 'closed', exit_price: 1 })).toBe(-100);
    expect(positionPnl({ ...base, strategy: 'tqqq_benchmark', entry_price: 625, mark_conservative: 700 })).toBe(75);
    expect(positionPnl({ ...base, mark_conservative: null })).toBeNull();
  });
  it('agrupa por estrategia', () => {
    const t = pnlByStrategy([base, { ...base, id: '2', status: 'closed', exit_price: 1 }]);
    expect(t.canary_put).toEqual({ pnl: 0, cost: 400, n: 2, open: 1 });
  });
  it('trazo de la gráfica pequeña', () => {
    expect(sparkPath([0, 100], 10, 10)).toBe('M0.0,10.0L10.0,0.0');
    expect(sparkPath([5], 10, 10)).toBeNull();
  });
});
