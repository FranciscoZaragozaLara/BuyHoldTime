import { buildShillerPlanchadoLine, planchadoRatioFor, shouldRefreshLine } from "../modules/market-data/market-sync.service";

/**
 * SALVAGUARDA: el planchado de shiller_daily.csv no debe asumir posición de columnas.
 * Regresión oct-2026: al agregar la columna `pe` en 2ª posición, el planchado leía
 * lastCols[1] como CAPE y publicaba el PE (~26) como CAPE — la card Schiller PE
 * mostraba 26.x tras sincronizar y 41+ al refrescar (cuando daily_update.py
 * reconstruía el archivo).
 */

const NEW_HEADER = "date,pe,cape,cape_sma3,cape_sma5,cape_sma10,cape_ema3,cape_ema5,cape_ema10,mean3y,mean5y,mean10y,mean3y_ema,mean5y_ema,mean10y_ema,std3y,std5y,std10y";
const NEW_LAST = "2026-10-08,26.42736,41.50840,41.66873,41.56820,41.33746,41.57941,41.54153,41.43814,36.44313,34.35939,32.64072,37.01468,35.41700,32.85096,3.23616,4.23384,4.01008";
const OLD_HEADER = "date,cape,cape_sma3,cape_sma5,cape_sma10,cape_ema3,cape_ema5,cape_ema10,mean3y,mean5y,mean10y,mean3y_ema,mean5y_ema,mean10y_ema,std3y,std5y,std10y";
const OLD_LAST = "2026-10-08,41.50840,41.66873,41.56820,41.33746,41.57941,41.54153,41.43814,36.44313,34.35939,32.64072,37.01468,35.41700,32.85096,3.23616,4.23384,4.01008";

describe("Shiller planchado header-aware Suite", () => {
  it("con columna pe: el CAPE planchado escala desde cape (no desde pe)", () => {
    const line = buildShillerPlanchadoLine(NEW_HEADER, NEW_LAST, "2026-10-09", 1.01, [41.4, 41.5, 41.5084]);
    const cols = line.split(',');
    expect(cols.length).toBe(NEW_HEADER.split(',').length);
    expect(cols[0]).toBe("2026-10-09");
    expect(parseFloat(cols[2])).toBeCloseTo(41.5084 * 1.01, 4); // cape, no 26.42*1.01
    expect(parseFloat(cols[1])).toBeCloseTo(26.42736 * 1.01, 4); // pe también escala
  });

  it("con ratio 1 conserva valores y columnas", () => {
    const line = buildShillerPlanchadoLine(NEW_HEADER, NEW_LAST, "2026-10-09", 1, [41.5084]);
    const cols = line.split(',');
    expect(cols.length).toBe(18);
    expect(parseFloat(cols[2])).toBeCloseTo(41.5084, 5);
    expect(parseFloat(cols[1])).toBeCloseTo(26.42736, 5);
  });

  it("header viejo sin pe sigue funcionando (compatibilidad)", () => {
    const line = buildShillerPlanchadoLine(OLD_HEADER, OLD_LAST, "2026-10-09", 1.01, [41.5, 41.5084]);
    const cols = line.split(',');
    expect(cols.length).toBe(OLD_HEADER.split(',').length);
    expect(parseFloat(cols[1])).toBeCloseTo(41.5084 * 1.01, 4);
  });
});

describe("Shiller planchado lunes-tras-finde Suite", () => {
  // Regresión nov-2026: el CAPE del lunes 9 quedó igual al del viernes 6 pese a
  // SPX +1.4%, porque (a) el prev se buscaba por fecha exacta (sábado sin fila →
  // ratio 1) y (b) la línea del lunes ya existía plana y se saltaba sin corregir.
  const closes = new Map([
    ["2026-11-06", 7376.86],
    ["2026-11-09", 7479.97],
  ]);
  it("prev usa el último cierre hábil (sábado sin fila no fuerza ratio 1)", () => {
    const r = planchadoRatioFor(closes, "2026-11-07", "2026-11-09");
    expect(r.prev).toBeCloseTo(7376.86, 2);
    expect(r.cur).toBeCloseTo(7479.97, 2);
    expect(r.ratio).toBeCloseTo(7479.97 / 7376.86, 5);
  });
  it("sin cierre del día objetivo el ratio es 1 (planchado plano)", () => {
    const r = planchadoRatioFor(closes, "2026-11-06", "2026-11-07");
    expect(r.ratio).toBe(1);
  });
  it("la línea del día objetivo se reescribe (el resto histórico se congela)", () => {
    expect(shouldRefreshLine(true, "2026-11-09", "2026-11-09")).toBe(true);
    expect(shouldRefreshLine(true, "2026-11-07", "2026-11-09")).toBe(false);
    expect(shouldRefreshLine(false, "2026-11-09", "2026-11-09")).toBe(false);
  });
  it("el lunes reescala el CAPE del viernes (~40.04, no 39.49 plano)", () => {
    const fri = "2026-11-06,25.26405,39.49296,40.00804,40.35888,39.60000,40.21337,40.39213,40.55352,36.35752,34.30802,32.61503,36.86794,35.32340,32.80193,3.11931,4.15560,3.95814";
    const r = planchadoRatioFor(closes, "2026-11-07", "2026-11-09");
    const line = buildShillerPlanchadoLine(NEW_HEADER, fri, "2026-11-09", r.ratio, [39.49, 39.49, 39.49296]);
    const cols = line.split(',');
    expect(parseFloat(cols[2])).toBeCloseTo(39.49296 * (7479.97 / 7376.86), 3);
  });
});
