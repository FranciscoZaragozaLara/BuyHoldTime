// Bandas CAPE anuales del semáforo BHT desde packages/bht-bands/bands.json.
// Fuente única compartida con el frontend; el histórico se puntúa con las
// bandas del año del dato (sin futuro: el año sale de la propia fecha).
import * as fs from 'fs';
import * as path from 'path';

export type Seg = [number, number, number, number];

interface JsonSeg {
  lo: number | null;
  hi: number | null;
  scoreLo: number;
  scoreHi: number;
  label?: string;
  display?: string;
}
interface BandsFile {
  defaultYear: string;
  years: Record<string, { CAPE?: { segments: JsonSeg[] } }>;
}

// Bandas vigentes (2027): respaldo si el JSON no se encuentra. No editar aquí;
// la calibración vive en packages/bht-bands/bands.json.
const FALLBACK_SEGS: Seg[] = [
  [-Infinity, 19.3, 0, 0], [19.3, 29, 0, 25], [29, 35, 25, 50], [35, 40, 50, 70],
  [40, 43, 70, 100], [43, Infinity, 100, 100],
];

let fileCache: BandsFile | null = null;
let fileFailed = false;

function findBandsFile(): string | null {
  if (process.env.BHT_BANDS_JSON && fs.existsSync(process.env.BHT_BANDS_JSON)) {
    return process.env.BHT_BANDS_JSON;
  }
  const starts = [process.cwd(), __dirname];
  for (const s of starts) {
    let dir = path.resolve(s);
    for (let i = 0; i < 6; i++) {
      const cand = path.join(dir, 'packages', 'bht-bands', 'bands.json');
      if (fs.existsSync(cand)) return cand;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function loadBands(): BandsFile | null {
  if (fileCache) return fileCache;
  if (fileFailed) return null;
  const f = findBandsFile();
  if (!f) {
    fileFailed = true;
    console.warn('[bht-bands] bands.json no encontrado, usando bandas vigentes por defecto');
    return null;
  }
  try {
    fileCache = JSON.parse(fs.readFileSync(f, 'utf8')) as BandsFile;
    return fileCache;
  } catch (e) {
    fileFailed = true;
    console.warn(`[bht-bands] no se pudo leer ${f}, usando bandas por defecto`);
    return null;
  }
}

function toSegs(segs: JsonSeg[]): Seg[] {
  return segs.map((s) => [
    s.lo ?? -Infinity,
    s.hi ?? Infinity,
    s.scoreLo,
    s.scoreHi,
  ] as Seg);
}

// Año exacto; si falta, el anterior más cercano; si no hay, defaultYear.
export function capeSegsForYear(year: string): Seg[] {
  const bf = loadBands();
  if (!bf) return FALLBACK_SEGS;
  const direct = bf.years[year]?.CAPE?.segments;
  if (direct) return toSegs(direct);
  const y = parseInt(year, 10);
  let best: string | null = null;
  for (const k of Object.keys(bf.years)) {
    const ky = parseInt(k, 10);
    if (!isNaN(ky) && ky <= y && (best == null || ky > parseInt(best, 10))) best = k;
  }
  const segs = (best ? bf.years[best]?.CAPE?.segments : null) ?? bf.years[bf.defaultYear]?.CAPE?.segments;
  if (!segs) return FALLBACK_SEGS;
  return toSegs(segs);
}

export function capeSegsForDate(isoDate: string): Seg[] {
  return capeSegsForYear(isoDate.slice(0, 4));
}

// Solo para tests: inyecta un JSON sin tocar disco (null = olvidar caché y recargar de disco).
export function __setBandsForTest(bf: BandsFile | null) {
  if (bf == null) {
    fileCache = null;
    fileFailed = false;
  } else {
    fileCache = bf;
  }
}
