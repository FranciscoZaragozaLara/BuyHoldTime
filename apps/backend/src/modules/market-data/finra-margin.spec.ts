import { parseFinraMargin } from './finra-margin';

describe('parseFinraMargin', () => {
  it('toma YYYY-MM y el saldo deudor, ignora encabezado y filas vacías', () => {
    const rows = [['Year-Month', 'Debit Balances'], ['2026-10', 1448360], ['2026-09', '1,480,054'], ['', null], ['nota', 5]];
    expect(parseFinraMargin(rows)).toEqual([['2026-10-01', 1448360], ['2026-09-01', 1480054]]);
  });
});
