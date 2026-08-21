const PALETTE = [
  '#2dd4bf', // teal
  '#a78bfa', // violet
  '#c084fc', // purple
  '#fbbf24', // amber
  '#38bdf8', // sky
  '#f87171', // red
  '#4ade80', // green
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#60a5fa', // blue
  '#facc15', // yellow
  '#34d399', // emerald
  '#f43f5e', // rose
  '#818cf8', // indigo
  '#f97316', // orange-500
  '#22d3ee', // cyan
  '#a3e635', // lime
  '#ec72ff', // pink
];

// hash code to deterministic index
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const OVERRIDES: Record<string, string> = {
  MALLIK_TQQQ: '#2dd4bf',
  SCHILLER_TQQQ_5A: '#a78bfa',
  SCHILLER_TQQQ_10A: '#c084fc',
  BH_QQQ: '#fbbf24',
  BH_TQQQ: '#38bdf8',
};

export function getStrategyColor(code: string): string {
  if (OVERRIDES[code]) return OVERRIDES[code];
  const idx = hashCode(code) % PALETTE.length;
  return PALETTE[idx];
}

export function getStrategyBadgeStyle(code: string): React.CSSProperties {
  const c = getStrategyColor(code);
  return { background: c };
}
