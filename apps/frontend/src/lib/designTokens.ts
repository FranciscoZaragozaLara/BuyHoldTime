// Tokens de diseño para JS (gráficas, SVG, estilos en línea). Mismo significado que los tokens
// de globals.css (text-accent-*, bg-favorable-*, …): accent = único acento; favorable / caution /
// elevated / risk = lectura del mercado. Los valores son los que ya usaban las gráficas.
export const TOKENS = {
  accent: '#14b8a6',
  favorable: '#10b981',
  caution: '#f59e0b',
  elevated: '#f97316',
  risk: '#ef4444',
} as const;

export type TokenName = keyof typeof TOKENS;
