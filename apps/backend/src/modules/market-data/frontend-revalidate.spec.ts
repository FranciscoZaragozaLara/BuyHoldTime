import { notifyFrontendRevalidate } from './frontend-revalidate';

describe('notifyFrontendRevalidate', () => {
  test('sin URL o secreto no llama', async () => {
    const f = jest.fn();
    expect(await notifyFrontendRevalidate({ url: '', secret: 's' }, f as any)).toEqual({ ok: false, skipped: true });
    expect(await notifyFrontendRevalidate({ url: 'http://x', secret: undefined }, f as any)).toEqual({ ok: false, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });
  test('POST con el secreto en el header y la etiqueta market-data', async () => {
    const f = jest.fn(async () => ({ ok: true, status: 200 }));
    expect(await notifyFrontendRevalidate({ url: 'http://frontend:3000/api/revalidate', secret: 'abc' }, f as any)).toEqual({ ok: true, status: 200 });
    const [url, init] = (f.mock.calls[0] as unknown) as [string, any];
    expect(url).toBe('http://frontend:3000/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-revalidate-secret']).toBe('abc');
    expect(JSON.parse(init.body)).toEqual({ tags: ['market-data'] });
  });
  test('errores no lanzan', async () => {
    const f = jest.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await notifyFrontendRevalidate({ url: 'http://x', secret: 's' }, f as any)).toEqual({ ok: false, error: 'ECONNREFUSED' });
    const g = jest.fn(async () => ({ ok: false, status: 401 }));
    expect(await notifyFrontendRevalidate({ url: 'http://x', secret: 's' }, g as any)).toEqual({ ok: false, status: 401 });
  });
});
