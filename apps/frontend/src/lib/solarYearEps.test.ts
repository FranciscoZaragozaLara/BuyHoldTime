import { describe, expect, test } from 'vitest';
import { solarYearEps, type EpsQuarter } from './solarYearEps';

const q = (date: string, eps: number, epsDiluted?: number): EpsQuarter => ({ date, eps, epsDiluted });

// Trimestres de ejemplo (AAPL-like): 2025 completo, 2026 con 3 trimestres.
const all: EpsQuarter[] = [
  q('2025-03-31', 1.5), q('2025-06-30', 1.6), q('2025-09-30', 1.7), q('2025-12-31', 2.4),
  q('2026-03-31', 1.65), q('2026-06-30', 1.8), q('2026-09-30', 2.11),
];
const of = (y: number) => all.filter((x) => x.date.startsWith(String(y)));

describe('solarYearEps', () => {
  test('año completo: suma de sus 4 trimestres', () => {
    expect(solarYearEps(of(2025), all, 2025, 2026)).toEqual({ eps: 7.2, isTtm: false });
  });

  test('año en curso incompleto: TTM (últimos 4 trimestres hasta el más reciente)', () => {
    // 2025-12 + 2026-03 + 2026-06 + 2026-09 = 2.4 + 1.65 + 1.8 + 2.11
    expect(solarYearEps(of(2026), all, 2026, 2026)).toEqual({ eps: 7.96, isTtm: true });
  });

  test('año pasado incompleto: suma lo que hay (no TTM)', () => {
    expect(solarYearEps(of(2025).slice(0, 2), all, 2025, 2026)).toEqual({ eps: 3.1, isTtm: false });
  });

  test('prefiere EPS diluido sobre básico', () => {
    const qs = [q('2024-03-31', 1, 0.9), q('2024-06-30', 1, 0.9), q('2024-09-30', 1, 0.9), q('2024-12-31', 1, 0.9)];
    expect(solarYearEps(qs, qs, 2024, 2026).eps).toBe(3.6);
  });

  test('el orden de allQuarters no importa', () => {
    expect(solarYearEps(of(2026), [...all].reverse(), 2026, 2026).eps).toBe(7.96);
  });
});
