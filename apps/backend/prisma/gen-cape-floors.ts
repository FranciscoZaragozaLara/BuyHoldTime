import * as fs from 'fs';
import * as path from 'path';
import { applyCapeFloor, BandSeg, capeFloorForYear, MonthlyCape } from '../src/modules/backtesting/cape-floor';

// Escribe el piso anual del CAPE en packages/bht-bands/bands.json (ver src/modules/backtesting/cape-floor.ts).
// Fuente: CAPE mensual de Shiller desde 1881 (BackTesting/data/shiller_combined.csv; SHILLER_DATA_DIR o
// SHILLER_COMBINED_CSV para otra ruta). Años sin entrada desde 1990 se crean copiando las bandas de
// defaultYear (lo mismo que ya resolvía el backend) para poder darles su propio piso.
// Correr cada enero (tras agregar el año nuevo) y luego recalcular el termómetro:
//   npx ts-node prisma/gen-cape-floors.ts && FROM=AAAA-01-01 npx ts-node prisma/compute-thermo-history.ts
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BANDS = path.join(ROOT, 'packages', 'bht-bands', 'bands.json');
const CSV = process.env.SHILLER_COMBINED_CSV
  || path.join(process.env.SHILLER_DATA_DIR || path.join(ROOT, '..', 'BackTesting', 'data'), 'shiller_combined.csv');
const FIRST_YEAR = 1990;

function readMonthly(): MonthlyCape[] {
  const [head, ...lines] = fs.readFileSync(CSV, 'utf8').trim().split('\n');
  const cols = head.split(',');
  const di = cols.indexOf('date'), ci = cols.indexOf('CAPE');
  return lines.map((l) => l.split(',')).filter((c) => c[ci]).map((c) => ({ date: c[di], cape: Number(c[ci]) })).filter((m) => Number.isFinite(m.cape));
}

/** Mismo estilo que el archivo a mano: indentación 2 y un segmento por línea. */
function format(v: unknown, ind = ''): string {
  if (Array.isArray(v)) {
    const inner = ind + '  ';
    return `[\n${v.map((x) => inner + (x && typeof x === 'object' && !Array.isArray(x) ? `{ ${Object.entries(x).map(([k, y]) => `${JSON.stringify(k)}: ${JSON.stringify(y)}`).join(', ')} }` : format(x, inner))).join(',\n')}\n${ind}]`;
  }
  if (v && typeof v === 'object') {
    const inner = ind + '  ';
    return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner)}`).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}

function main() {
  const monthly = readMonthly();
  const bands = JSON.parse(fs.readFileSync(BANDS, 'utf8'));
  const years: Record<string, any> = bands.years;
  const last = Math.max(...Object.keys(years).map(Number));
  const def = years[bands.defaultYear];
  const calibrated = Object.keys(years).filter((k) => !String(years[k].note ?? '').startsWith('Sin calibración')).map(Number);
  for (let y = FIRST_YEAR; y <= last; y++) {
    if (!years[String(y)]) {
      const prev = calibrated.filter((k) => k < y).sort((a, b) => b - a)[0];
      years[String(y)] = JSON.parse(JSON.stringify(prev != null ? years[String(prev)] : def));
      years[String(y)].note = `Sin calibración propia: copia de ${prev ?? bands.defaultYear} (lo que ya resolvía el backend) para darle su piso anual.`;
    }
    const floor = capeFloorForYear(monthly, y);
    if (floor == null) throw new Error(`Sin historia suficiente para el piso de ${y}`);
    const cape = years[String(y)].CAPE;
    cape.segments = applyCapeFloor(cape.segments as BandSeg[], floor);
    cape.floor = { value: cape.segments[0].hi, method: 'P5 del CAPE mensual de Shiller de los 20 años previos (sin datos futuros)' };
    console.log(`${y}: piso ${cape.segments[0].hi} · corte ${cape.segments[1].hi}`);
  }
  // Orden numérico de años (JSON.parse ya los ordena; se reconstruye por claridad).
  bands.years = Object.fromEntries(Object.keys(years).sort().map((k) => [k, years[k]]));
  fs.writeFileSync(BANDS, format(bands) + '\n');
}

main();
