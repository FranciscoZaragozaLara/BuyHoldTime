import { impliedForwardEps, parseWsjPeYields } from './wsj-pe';

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
