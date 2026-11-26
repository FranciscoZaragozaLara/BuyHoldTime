// Días sin mercado (bolsa de Nueva York) para el BHT diario: en fines de semana y feriados el BHT repite el del último
// día hábil. Antes, el día de Thanksgiving 2026 (26-nov) movía el BHT de 53.2 a 53.7 con cotizaciones de feriado: un ^VIX
// de Yahoo fechado ese día (provisional que FRED nunca reemplaza, porque no publica en feriados) y el Fear & Greed que
// CNN recalcula a diario.
//
// Historia: un día entre semana sin cierre del S&P 500 habiendo cierres a ambos lados es un día cerrado (cubre cierres
// especiales: 11-sep-2001, Sandy 2012, funerales de Estado). Hoy y fechas aún sin cierres: reglas de feriados de la NYSE.

type DateMap = Map<string, number>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export const shiftDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5));

/** n-ésimo día de la semana (0 = domingo) del mes; n = -1 → el último. */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  if (n > 0) {
    const first = utc(y, m, 1).getUTCDay();
    return iso(utc(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7));
  }
  const lastDay = utc(y, m + 1, 0);
  return iso(utc(y, m, lastDay.getUTCDate() - ((lastDay.getUTCDay() - dow + 7) % 7)));
}

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

/** Feriado fijo con regla de observancia: sábado → viernes previo, domingo → lunes siguiente. */
function observed(y: number, m: number, d: number): string {
  const dt = utc(y, m, d), dow = dt.getUTCDay();
  return iso(dow === 6 ? utc(y, m, d - 1) : dow === 0 ? utc(y, m, d + 1) : dt);
}

/** Feriados regulares de la NYSE del año (reglas vigentes; Juneteenth desde 2022, MLK desde 1998). */
export function nyseHolidays(y: number): Set<string> {
  const out = new Set<string>([
    nthWeekday(y, 2, 1, 3), // Presidents Day
    iso(new Date(easter(y).getTime() - 2 * 864e5)), // Viernes Santo
    nthWeekday(y, 5, 1, -1), // Memorial Day
    observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1), // Labor Day
    nthWeekday(y, 11, 4, 4), // Thanksgiving
    observed(y, 12, 25),
  ]);
  // Año nuevo: si cae en sábado no se recorre al viernes 31-dic (la NYSE abre); en domingo, lunes 2.
  if (utc(y, 1, 1).getUTCDay() !== 6) out.add(observed(y, 1, 1));
  if (y >= 1998) out.add(nthWeekday(y, 1, 1, 3)); // Martin Luther King Jr.
  if (y >= 2022) out.add(observed(y, 6, 19)); // Juneteenth
  return out;
}

const hasNear = (spx: DateMap, day: string, dir: 1 | -1) => {
  for (let k = 1; k <= 4; k++) if (spx.has(shiftDays(day, dir * k))) return true;
  return false;
};

/** ¿La bolsa estuvo (o está) cerrada ese día? `spx` = cierres diarios del S&P 500 (fecha ISO → cierre). */
export function isMarketClosed(day: string, spx?: DateMap): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return true;
  if (spx?.has(day)) return false;
  if (nyseHolidays(Number(day.slice(0, 4))).has(day)) return true;
  return !!spx && hasNear(spx, day, -1) && hasNear(spx, day, 1); // cierre especial en la historia
}

/** El mismo día si hubo mercado; si no, el último día hábil anterior. */
export function lastOpenDay(day: string, spx?: DateMap): string {
  let d = day;
  for (let k = 0; k < 10 && isMarketClosed(d, spx); k++) d = shiftDays(d, -1);
  return d;
}
