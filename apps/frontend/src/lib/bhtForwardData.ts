// Serie completa de bht-forward (BHT diario + retornos maduros a 1/2/3/5 años desde 1993): ~10 s de descarga, así que
// se pide una sola vez por sesión y la comparten la tabla BHT Forward y el resumen por bandas. `force` la vuelve a pedir
// (tras una actualización de datos).
import { getApiBase } from './apiBase';

let cached: Promise<any[]> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
export function fetchBhtForwardAll(force = false) {
  if (!cached || force) {
    cached = fetch(`${getApiBase()}/api/backtesting/bht-forward?from=1993-01-01`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => { cached = null; return []; });
  }
  return cached;
}
