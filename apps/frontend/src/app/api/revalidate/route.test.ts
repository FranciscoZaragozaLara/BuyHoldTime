import { afterEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));
const { POST } = await import('./route');

const req = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request('http://localhost/api/revalidate', { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }) as never;

describe('POST /api/revalidate', () => {
  afterEach(() => { revalidateTag.mockClear(); vi.unstubAllEnvs(); });
  it('503 sin secreto configurado', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '');
    expect((await POST(req({ 'x-revalidate-secret': 'x' }))).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('401 con secreto incorrecto o ausente', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'secreto-de-prueba');
    expect((await POST(req({ 'x-revalidate-secret': 'otro' }))).status).toBe(401);
    expect((await POST(req())).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('invalida market-data con expire 0', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'secreto-de-prueba');
    const res = await POST(req({ 'x-revalidate-secret': 'secreto-de-prueba', 'content-type': 'application/json' }, { tags: ['market-data'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revalidated: true, tags: ['market-data'] });
    expect(revalidateTag).toHaveBeenCalledWith('market-data', { expire: 0 });
  });
});
