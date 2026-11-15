// Avisa al frontend (Next) que descarte su caché de datos de mercado (home, /indicators) cuando termina
// una sincronización. POST {FRONTEND_REVALIDATE_URL} con header x-revalidate-secret = REVALIDATE_SECRET.
// Sin configuración no hace nada: la caché del frontend expira sola (1 h) como respaldo.
export type RevalidateResult = { ok: boolean; skipped?: boolean; status?: number; error?: string };

export async function notifyFrontendRevalidate(
  env: { url?: string; secret?: string } = { url: process.env.FRONTEND_REVALIDATE_URL, secret: process.env.REVALIDATE_SECRET },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<RevalidateResult> {
  if (!env.url || !env.secret) return { ok: false, skipped: true };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(env.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.secret },
      body: JSON.stringify({ tags: ['market-data'] }),
      signal: ac.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}
