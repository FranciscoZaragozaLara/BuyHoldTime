import { impliedForwardEps, MonthlyPeEntry, parseWsjPeYields, setMonthlyPe, WSJ_NDX } from './wsj-pe';

const row = (name: string, ...v: string[]) => `<tr class="r"><td class="c is-first">${name}</td>${v.map((x) => `<td class="c">${x}</td>`).join('')}</tr>`;
const table = (date: string, rows: string) => `<table class="t"><thead><tr><th></th><th colSpan="3"><div>P/E RATIO</div></th><th colSpan="2"><div>DIV YIELD</div></th></tr>
<tr><th></th><th>${date}†</th><th>Year ago†</th><th>Estimate^</th><th>${date}†</th><th>Year ago†</th></tr></thead><tbody>${rows}</tbody></table>`;
const HTML = `<h3>Dow Jones</h3>${table('11/12/26', row('Dow Jones Industrial Average', '20.31', '24.81', '19.16', '1.53', '1.73'))}
<h3>Other Indexes</h3>${table('11/06/26', row('Russell 2000 Index', '34.29', '33.62', '25.25', '1.59', '1.38') + row('NASDAQ 100 Index', '26.98', '33.62', '19.70', '0.63', '0.65') + row('S&amp;P 500 Index', '22.37', '25.75', '18.95', '1.11', '1.18'))}`;

describe('parseWsjPeYields', () => {
  test('S&P 500 con la fecha de corte de su propia tabla', () => {
    expect(parseWsjPeYields(HTML)).toEqual({ index: 'S&P 500 Index', asOf: '2026-11-06', trailing: 22.37, yearAgo: 25.75, estimate: 18.95 });
  });
  test('otros índices y casos sin dato', () => {
    expect(parseWsjPeYields(HTML, 'NASDAQ 100 Index')?.estimate).toBe(19.7);
    expect(parseWsjPeYields(HTML, 'Dow Jones Industrial Average')?.asOf).toBe('2026-11-12');
    expect(parseWsjPeYields('<html>bloqueado</html>')).toBeNull();
    expect(parseWsjPeYields(table('11/06/26', row('S&amp;P 500 Index', '22.37', '25.75', '—')))?.estimate).toBeNull();
  });
  test('EPS implícito', () => {
    expect(impliedForwardEps(7376.86, 18.95)).toBe(389.2802);
  });
});

describe('setMonthlyPe', () => {
  const e = (date: string, pe: number): MonthlyPeEntry => ({ date, period: `M${date.slice(5, 7)}`, fiscalYear: date.slice(0, 4), revenue: 0, netIncome: 0, eps: 0, epsDiluted: 0, sharesOutstanding: 0, peRatio: pe, source: 'real' });
  const base = [e('2026-10-31', 27.12), e('2026-09-30', 29.06)];
  test('mes nuevo: entrada al fin de mes, primero en la lista, sin tocar los demás', () => {
    const r = setMonthlyPe(base, '2026-11-06', 26.98);
    expect(r).toEqual([e('2026-11-30', 26.98), ...base]);
    expect(base).toHaveLength(2);
  });
  test('mismo mes: reemplaza (queda el último dato semanal) y febrero bisiesto', () => {
    const r = setMonthlyPe(setMonthlyPe(base, '2026-11-06', 26.98), '2026-11-27', 27.5);
    expect(r.filter((x) => x.date.startsWith('2026-11'))).toEqual([e('2026-11-30', 27.5)]);
    expect(setMonthlyPe([], '2028-02-25', 30)[0].date).toBe('2028-02-29');
    expect(setMonthlyPe([], '2026-10-30', 26.123456)[0]).toEqual(e('2026-10-31', 26.1235));
  });
  test('fila del Nasdaq 100 en la tabla', () => {
    expect(parseWsjPeYields(HTML, WSJ_NDX)).toMatchObject({ asOf: '2026-11-06', trailing: 26.98, estimate: 19.7 });
  });
});
