import * as xlsx from 'xlsx';

/** Excel de estadísticas de margen de FINRA (columna A «YYYY-MM», B saldos deudores en millones de $). */
export const FINRA_MARGIN_URL = 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx';

/** Filas [fecha YYYY-MM-01, saldo deudor] de la hoja (orden de la hoja: más nuevo primero). Se guarda el día 1
 *  del mes, como daily_update.py; el termómetro le aplica su rezago de publicación (PUB_LAG_DAYS). */
export function parseFinraMargin(rows: unknown[][]): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const r of rows.slice(1)) {
    const ym = String(r?.[0] ?? '').trim();
    const v = Number(String(r?.[1] ?? '').replace(/,/g, ''));
    if (/^\d{4}-\d{2}$/.test(ym) && Number.isFinite(v) && v > 0) out.push([`${ym}-01`, v]);
  }
  return out;
}

export function readFinraWorkbook(buf: Buffer): Array<[string, number]> {
  const wb = xlsx.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return parseFinraMargin(xlsx.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]);
}
