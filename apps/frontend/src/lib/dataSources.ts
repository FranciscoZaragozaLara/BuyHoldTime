// Fuentes de datos que se pueden nombrar en el sitio: solo las públicas y gratuitas (agencias de EE. UU. y los datos de
// Shiller en Yale). Las comerciales o con términos de uso restrictivos (proveedores de cotizaciones, prensa
// financiera, índices de sentimiento propietarios, scrapers) no se mencionan mientras no haya licencia para ello.

const PUBLIC_SOURCES: Array<[RegExp, string]> = [
  [/^fred\b/i, 'FRED'],
  [/^shiller\b/i, 'Shiller'],
  [/^(sec|edgar)\b|sec edgar/i, 'SEC EDGAR'],
  [/^finra\b/i, 'FINRA'],
  [/^bls\b/i, 'BLS'],
  [/^bea\b/i, 'BEA'],
];

/** Nombre a mostrar de una fuente, o null si no es pública (no se muestra). */
export function publicSourceLabel(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  for (const [re, label] of PUBLIC_SOURCES) if (re.test(s)) return label;
  return null;
}
