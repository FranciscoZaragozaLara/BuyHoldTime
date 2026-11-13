// "hace 3 h" / "3h ago" para fechas de corridas del panel de admin.
export function timeAgo(iso: string, locale: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const es = locale === 'es';
  if (s < 60) return es ? 'hace segundos' : 'seconds ago';
  const m = Math.round(s / 60); if (m < 60) return es ? `hace ${m} min` : `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return es ? `hace ${h} h` : `${h} h ago`;
  const d = Math.round(h / 24); return es ? `hace ${d} d` : `${d} d ago`;
}
