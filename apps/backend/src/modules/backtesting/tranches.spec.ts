import { athAt, capeMedian20, computeSellTranches, computeTranches, creditAt, prepareTranches, TRANCHE_CFG, type TrancheSeries } from './tranches';

// Serie sintética: 300 sesiones subiendo despacio y luego un desplome de 10 sesiones (−20%).
function series(opts: { oasRising?: boolean } = {}): TrancheSeries {
  const n = 320;
  const dates = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10));
  const spx = dates.map((_, k) => (k < 300 ? 100 + k * 0.05 : 115 * (1 - 0.022 * Math.min(10, k - 299))));
  const vix = dates.map((_, k) => (k < 300 ? 15 : 50));
  const vix3m = dates.map((_, k) => (k < 300 ? 17 : 38)); // ratio 1.32 en el desplome
  const oas = dates.map((_, k) => (k < 300 ? 4 : opts.oasRising ? 4 + (k - 299) * 0.5 : 4));
  return { dates, spx, qqq: spx, vix, vix3m, oas, cape: dates.map(() => 30), capeMedian20: dates.map(() => 25) };
}

describe('módulo de reentrada por tranches', () => {
  test('desplome rápido con pánico y crédito sano: T0 (morado), 25% en 1×', () => {
    const P = prepareTranches(series(), 'voo');
    const r = computeTranches(P, '2020-11-05')!; // k = 309: −20% desde el máximo, −20% en 10 días
    expect(r.episode).not.toBeNull();
    expect(r.light).toBe('purple');
    const t0 = r.tranches.find((t) => t.id === 'T0')!;
    expect(t0.status).not.toBe('pending');
    expect(r.deployed).toBeCloseTo(TRANCHE_CFG.weights.T0, 9);
    expect(r.leverage).toBeCloseTo(0.25, 9);
  });
  test('compra: onFire reporta cada compra histórica con la fecha y el precio del resultado', () => {
    const s = series();
    const P = prepareTranches(s, 'voo');
    const ev: Array<{ date: string; id: string; price: number }> = [];
    const r = computeTranches(P, s.dates[s.dates.length - 1], 'half', { onFire: (e) => ev.push(e) })!;
    const t0 = r.tranches.find((t) => t.id === 'T0')!;
    expect(t0.status).not.toBe('pending');
    expect(ev.find((e) => e.id === 'T0')).toMatchObject({ date: t0.date, price: t0.price, size: 1, backup: false });
  });

  test('crédito en zona sistémica: no hay T0 y el veto pinta rojo', () => {
    const P = prepareTranches(series({ oasRising: true }), 'voo');
    const r = computeTranches(P, '2020-11-05')!;
    expect(r.tranches.find((t) => t.id === 'T0')!.status).toBe('pending');
    expect(r.today.veto).toBe(true);
    expect(r.light).toBe('red');
  });
  test('sin caída relevante: gris y sin episodio', () => {
    const r = computeTranches(prepareTranches(series(), 'voo'), '2020-06-01')!;
    expect(r.light).toBe('gray');
    expect(r.episode).toBeNull();
    expect(r.deployed).toBe(0);
  });
  test('mediana de 20 años del CAPE: 240 meses previos, desde el mes siguiente', () => {
    const monthly = new Map<string, number>();
    for (let i = 0; i < 241; i++) monthly.set(`${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, i < 120 ? 10 : 30);
    const med = capeMedian20(['2019-12-15', '2020-01-15', '2020-02-15'], monthly);
    expect(med[0]).toBeNull(); // aún no hay 240 meses cerrados
    expect(med[1]).toBe(20); // 120 meses en 10 y 120 en 30
    expect(med[2]).toBe(30); // la ventana avanza un mes
  });
  test('el reingreso a la banda de Bollinger se anula si el precio vuelve a cerrar debajo', () => {
    // Caída fuerte (cierra bajo la banda), rebote que reingresa y nueva caída bajo la banda.
    const n = 120;
    const dates = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2021, 0, 1) + k * 86400000).toISOString().slice(0, 10));
    const spx = dates.map((_, k) => (k < 100 ? 100 : k === 100 ? 85 : k === 101 ? 99 : k === 102 ? 80 : 80));
    const base = { dates, spx, qqq: spx, vix: dates.map(() => 15), vix3m: dates.map(() => 17), oas: dates.map(() => 4), cape: dates.map(() => 30), capeMedian20: dates.map(() => 25) };
    const P = prepareTranches(base, 'voo');
    expect(computeTranches(P, dates[101])!.today.boll).toBe(true); // reingresó
    expect(computeTranches(P, dates[102])!.today.boll).toBe(false); // volvió a cerrar bajo la banda
  });
  test('caída desde ATH: histórico, o máximo de 5 años si el ATH es más viejo', () => {
    const dates = ['2010-01-04', '2020-06-01', '2024-01-02', '2026-11-20'];
    const a = athAt(dates, [100, 80, 90, 72], 3)!; // ATH de 2010 (> 5 años): contra el máximo de 5 años
    expect([a.date, a.price, a.window5y]).toEqual(['2024-01-02', 90, true]);
    expect(a.pct).toBeCloseTo(-20, 9);
    const b = athAt(dates, [50, 80, 90, 72], 3)!;
    expect([b.date, b.window5y]).toEqual(['2024-01-02', false]);
  });
  test('venta: BHT ≥ 70 abre el ciclo; V1 espera la primera debilidad (≥3% bajo el máximo de 20 días) y saca el 3×', () => {
    const n = 300;
    const dates = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2021, 0, 1) + k * 86400000).toISOString().slice(0, 10));
    // sube hasta k=260 y luego cae 5% en 5 sesiones; BHT 72 desde k=250
    const spx = dates.map((_, k) => (k <= 260 ? 100 + k * 0.2 : 152 * (1 - 0.01 * Math.min(5, k - 260))));
    const bht = dates.map((_, k) => (k >= 250 ? 72 : 50));
    const base = { dates, spx, qqq: spx, bht, vix: dates.map(() => 15), vix3m: dates.map(() => 17), oas: dates.map(() => 4), cape: dates.map(() => 30), capeMedian20: dates.map(() => 25) };
    const P = prepareTranches(base, 'voo');
    const before = computeSellTranches(P, dates[258])!; // ciclo abierto, en máximos: V1 espera
    expect(before.active).toBe(true);
    expect(before.tranches[0].status).toBe('pending');
    const after = computeSellTranches(P, dates[264])!; // −4% desde el máximo de 20 días
    expect(after.tranches[0].status).not.toBe('pending');
    expect(after.sold).toBeCloseTo(0.35, 9); // V1 (15%) y, al quedar bajo la SMA50, V4 (20%)
    expect(after.tranches[3].status).not.toBe("pending");
    expect(after.leverage).toBeLessThan(1.69); // salió del 3×
    expect(computeSellTranches(P, dates[100])!.active).toBe(false);
  });

  // Crédito que se rompe con la bolsa en máximos (2007): OAS de 3 a 5 en 60 sesiones, precio aún cerca del máximo.
  function creditSeries(): TrancheSeries {
    const n = 420;
    const dates = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2006, 0, 1) + k * 86400000).toISOString().slice(0, 10));
    const spx = dates.map((_, k) => (k < 330 ? 100 + k * 0.05 : k < 345 ? 116.5 - (k - 330) * 0.25 : 112.75 - (k - 345) * 0.4));
    const oas = dates.map((_, k) => (k < 280 ? 3 : Math.min(5, 3 + (k - 280) * (2 / 60))));
    return { dates, spx, qqq: spx, vix: dates.map(() => 18), vix3m: dates.map(() => 20), oas, cape: dates.map(() => 30), capeMedian20: dates.map(() => 25), bht: dates.map(() => 50) };
  }

  test('crédito: divergencia crédito-bolsa abre un ciclo de venta sin BHT alto y V4 vende bajo la SMA50', () => {
    const s = creditSeries();
    const P = prepareTranches(s, 'voo');
    const k = s.dates.findIndex((_, i) => P.credDiv[i]);
    expect(k).toBeGreaterThan(280);
    const c = creditAt(P, k);
    expect(c.div).toBe(true);
    expect(c.ratio!).toBeGreaterThanOrEqual(1.5);
    const r = computeSellTranches(P, s.dates[360])!;
    expect(r.active).toBe(true);
    expect(r.creditCycle).toBe(true);
    expect(r.tranches.find((t) => t.id === 'V4')!.status).not.toBe('pending'); // BHT 50: sin crédito no vendería
    expect(r.tranches.find((t) => t.id === 'V1')!.status).toBe('pending');
  });

  test('venta: onSale reporta cada venta histórica (misma fecha y precio que el resultado) y si fue por crédito', () => {
    const s = creditSeries();
    const P = prepareTranches(s, 'voo');
    const ev: Array<{ date: string; id: string; price: number; credit: boolean }> = [];
    const r = computeSellTranches(P, s.dates[360], (e) => ev.push(e))!;
    const v4 = r.tranches.find((t) => t.id === 'V4')!;
    expect(ev.find((e) => e.id === 'V4')).toEqual({ date: v4.date, id: 'V4', price: v4.price, credit: true });
  });

  test('crédito: sin divergencia (la bolsa ya cayó) no hay señal de crédito', () => {
    const s = creditSeries();
    s.spx = s.spx.map((v, k) => (k < 250 ? v : (v as number) * 0.85)); // cae 15% antes de que el crédito se rompa
    s.qqq = s.spx;
    const P = prepareTranches(s, 'voo');
    expect(P.credDiv.some(Boolean)).toBe(false);
    expect(computeSellTranches(P, s.dates[360])!.creditCycle).toBe(false);
  });
});

