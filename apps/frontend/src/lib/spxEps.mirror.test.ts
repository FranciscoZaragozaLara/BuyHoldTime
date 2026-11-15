import { describe, expect, it } from 'vitest';
import * as front from './spxEps';

// El backend tiene una copia (apps/backend/src/modules/market-data/spx-eps.ts) para el P/E de /indicators;
// se importa por ruta calculada para que el type-check de `next build` (Docker sin backend) no la siga.
const backendModule = () => import(/* @vite-ignore */ new URL('../../../backend/src/modules/market-data/spx-eps.ts', import.meta.url).pathname);

describe('EPS registrado: frontend y backend dan lo mismo', () => {
  it('epsAvailableDate y epsAt en un calendario mensual de varios años', async () => {
    const back = (await backendModule()) as typeof front;
    const series = new Map<string, number>();
    for (let i = 0; i < 60; i++) series.set(new Date(Date.UTC(2021, i + 1, 0)).toISOString().slice(0, 10), 150 + i * 2.5);
    const fs = front.buildEpsSchedule(series), bs = back.buildEpsSchedule(series);
    expect(bs).toEqual(fs);
    for (let d = new Date('2021-01-01'); d <= new Date('2026-12-31'); d.setDate(d.getDate() + 11)) {
      const iso = d.toISOString().slice(0, 10);
      expect(back.epsAt(bs, iso)).toEqual(front.epsAt(fs, iso));
      expect(back.epsAvailableDate(iso)).toBe(front.epsAvailableDate(iso));
    }
  });
});
