import {
  buildShillerUpsertBatches,
  parseShillerCsv,
  SHILLER_NUMERIC_COLUMNS,
  shillerRecordsToCsv,
  toShillerApiRow,
} from './shiller-daily';

const HEADER = 'date,pe,cape,cape_sma3,cape_sma5,cape_sma10,cape_ema3,cape_ema5,cape_ema10,mean3y,mean5y,mean10y,mean3y_ema,mean5y_ema,mean10y_ema,std3y,std5y,std10y';

describe('parseShillerCsv', () => {
  test('lee todas las columnas del CSV de build_shiller_daily()', () => {
    const csv = `${HEADER}\n2026-11-12,30.1,40.99,40.77,40.49,40.31,40.79,40.61,40.45,36.68,34.36,32.73,37.07,35.5,32.93,1.39,2.29,3.26\n`;
    const [r] = parseShillerCsv(csv);
    expect(r.date).toBe('2026-11-12');
    expect(r.cape).toBe(40.99);
    expect(r.mean3y).toBe(36.68);
    expect(r.std10y).toBe(3.26);
  });

  test('vacíos, NaN y columnas ausentes → null; fechas inválidas se omiten', () => {
    const csv = 'date,cape,mean3y\n1990-01-01,17.6,\n1990-01-02,nan,15.6\nbasura,1,2\n\n';
    const rows = parseShillerCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '1990-01-01', cape: 17.6, mean3y: null, pe: null, std3y: null });
    expect(rows[1].cape).toBeNull();
  });

  test('fecha con hora se recorta a YYYY-MM-DD', () => {
    expect(parseShillerCsv('date,cape\n2026-11-12 00:00:00,41\n')[0].date).toBe('2026-11-12');
  });

  test('sin columna date lanza error', () => {
    expect(() => parseShillerCsv('fecha,cape\n2026-11-12,41\n')).toThrow('date');
  });
});

describe('buildShillerUpsertBatches', () => {
  const rec = (date: string, cape: number) =>
    ({ date, ...Object.fromEntries(SHILLER_NUMERIC_COLUMNS.map((c) => [c, null])), cape }) as any;

  test('parte en lotes y numera los parámetros de forma continua', () => {
    const batches = buildShillerUpsertBatches([rec('2026-01-01', 1), rec('2026-01-02', 2), rec('2026-01-05', 3)], 2);
    expect(batches).toHaveLength(2);
    const width = 1 + SHILLER_NUMERIC_COLUMNS.length;
    expect(batches[0].values).toHaveLength(2 * width);
    expect(batches[1].values).toHaveLength(width);
    expect(batches[0].text).toContain(`$${width + 1}::date`);
    expect(batches[0].text).toContain('ON CONFLICT ("date") DO UPDATE');
    expect(batches[0].text).toContain('"cape" = EXCLUDED."cape"');
    expect(batches[1].values[0]).toBe('2026-01-05');
  });

  test('sin registros no genera sentencias', () => {
    expect(buildShillerUpsertBatches([])).toEqual([]);
  });
});

describe('shillerRecordsToCsv', () => {
  test('ida y vuelta con parseShillerCsv conserva los valores', () => {
    const csv = `${HEADER}\n2026-11-12,30.1,40.99,,40.49,40.31,40.79,40.61,40.45,36.68,34.36,32.73,37.07,35.5,32.93,1.39,2.29,3.26\n`;
    const rows = parseShillerCsv(csv);
    const out = shillerRecordsToCsv(rows);
    expect(out.split('\n')[0]).toBe(HEADER);
    expect(parseShillerCsv(out)).toEqual(rows);
  });
});

describe('toShillerApiRow', () => {
  const base = {
    date: new Date('2026-11-12T00:00:00Z'), cape: 40, capeSma3: 1, capeSma5: 2, capeSma10: 3,
    capeEma3: 4, capeEma5: 5, capeEma10: 6, mean3y: 32, mean5y: 30, mean10y: 28,
    mean3yEma: 31, mean5yEma: 29, mean10yEma: 27,
  };

  test('misma forma que servía el CSV: mean = mean3y, capeRatio = cape / mean3y', () => {
    const r = toShillerApiRow(base);
    expect(r.date).toBe('2026-11-12');
    expect(r.mean).toBe(32);
    expect(r.capeRatio).toBeCloseTo(1.25);
    expect(Object.keys(r)).toEqual([
      'date', 'cape', 'capeSma3', 'capeSma5', 'capeSma10', 'capeEma3', 'capeEma5', 'capeEma10',
      'mean', 'mean3y', 'mean5y', 'mean10y', 'mean3yEma', 'mean5yEma', 'mean10yEma', 'capeRatio',
    ]);
  });

  test('sin mean3y (primeros 3 años) capeRatio es null', () => {
    expect(toShillerApiRow({ ...base, mean3y: null }).capeRatio).toBeNull();
  });
});
