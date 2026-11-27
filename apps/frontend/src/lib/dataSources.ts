// Fuentes de datos que se pueden nombrar en el sitio: las públicas y gratuitas (agencias de EE. UU. y los datos de
// Shiller en Yale) y las que se citan con atribución (índice Fear & Greed de CNN). Las comerciales o con términos de
// uso restrictivos (proveedores de cotizaciones, prensa financiera, scrapers) no se mencionan sin licencia.

const PUBLIC_SOURCES: Array<[RegExp, string]> = [
  [/^fred\b/i, 'FRED'],
  [/^shiller\b/i, 'Shiller'],
  [/^(sec|edgar)\b|sec edgar/i, 'SEC EDGAR'],
  [/^finra\b/i, 'FINRA'],
  [/^bls\b/i, 'BLS'],
  [/^bea\b/i, 'BEA'],
  [/^cnn\b/i, 'CNN'],
];

/** Nombre a mostrar de una fuente, o null si no es pública (no se muestra). */
export function publicSourceLabel(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  for (const [re, label] of PUBLIC_SOURCES) if (re.test(s)) return label;
  return null;
}
