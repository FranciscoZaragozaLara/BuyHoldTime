import { canServeSeries } from './licensed-series';

describe('series con licencia en el API público', () => {
  const pub = { ip: '203.0.113.9', headers: {} };
  test('ICE y WSJ: no al público; sí a la red interna o con clave', () => {
    const prev = process.env.SYNC_API_KEY;
    process.env.SYNC_API_KEY = 'k'.repeat(32);
    try {
      for (const t of ['BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'SPX_FWD_EPS', 'NDX_PE', 'NDX_FWD_PE']) {
        expect(canServeSeries(t, pub)).toBe(false);
        expect(canServeSeries(t, { ip: '127.0.0.1', headers: {} })).toBe(true);
        expect(canServeSeries(t, { ip: '203.0.113.9', headers: { 'x-api-key': 'k'.repeat(32) } })).toBe(true);
      }
    } finally {
      process.env.SYNC_API_KEY = prev;
    }
  });
  test('el resto (incluido el sentimiento de CNN, que se cita) sigue público', () => {
    for (const t of ['^GSPC', 'BAA10Y', 'HY_MODEL', 'FEAR_GREED', 'VIXCLS']) expect(canServeSeries(t, pub)).toBe(true);
  });
});
