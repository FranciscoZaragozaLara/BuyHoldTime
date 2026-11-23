import { filingsAfter, parseXbrlInstance, pickInstanceFile } from '../../prisma/edgar-xbrl-instance';

const XML = `<xbrli:xbrl>
  <xbrli:context id="q3"><xbrli:entity><xbrli:identifier>1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-07-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="ytd"><xbrli:entity><xbrli:identifier>1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="seg"><xbrli:entity><xbrli:identifier>1</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="x">y</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-07-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
  <us-gaap:EarningsPerShareDiluted contextRef="q3" unitRef="usdPerShare" decimals="2">3.11</us-gaap:EarningsPerShareDiluted>
  <us-gaap:EarningsPerShareDiluted contextRef="ytd" unitRef="usdPerShare" decimals="2">8.90</us-gaap:EarningsPerShareDiluted>
  <us-gaap:NetIncomeLoss contextRef="q3" unitRef="usd" decimals="-6">976000000</us-gaap:NetIncomeLoss>
  <us-gaap:NetIncomeLoss contextRef="seg" unitRef="usd" decimals="-6">100</us-gaap:NetIncomeLoss>
</xbrli:xbrl>`;

describe('respaldo XBRL de EDGAR', () => {
  test('hechos consolidados con la forma de companyfacts (sin contextos con dimensiones)', () => {
    const g = parseXbrlInstance(XML, { form: '10-Q', filed: '2026-11-09', accn: 'a-1' });
    expect(g.EarningsPerShareDiluted.units['USD/shares']).toEqual([
      { start: '2026-07-01', end: '2026-09-30', val: 3.11, form: '10-Q', filed: '2026-11-09', accn: 'a-1' },
      { start: '2026-01-01', end: '2026-09-30', val: 8.9, form: '10-Q', filed: '2026-11-09', accn: 'a-1' },
    ]);
    expect(g.NetIncomeLoss.units.USD).toEqual([{ start: '2026-07-01', end: '2026-09-30', val: 976000000, form: '10-Q', filed: '2026-11-09', accn: 'a-1' }]);
  });
  test('elige el XBRL extraído del inline y filtra reportes por periodo', () => {
    expect(pickInstanceFile(['ceg-20260930.htm', 'ceg-20260930_htm.xml', 'ceg-20260930_lab.xml', 'FilingSummary.xml'])).toBe('ceg-20260930_htm.xml');
    expect(pickInstanceFile(['a.htm'])).toBeNull();
    const sub = { filings: { recent: { form: ['8-K', '10-Q', '10-Q'], filingDate: ['2026-11-12', '2026-11-09', '2026-08-06'], reportDate: ['2026-11-11', '2026-09-30', '2026-06-30'], accessionNumber: ['x', 'y', 'z'], isXBRL: [0, 1, 1] } } };
    expect(filingsAfter(sub, '2026-06-30')).toEqual([{ form: '10-Q', filed: '2026-11-09', report: '2026-09-30', accn: 'y' }]);
  });
});
