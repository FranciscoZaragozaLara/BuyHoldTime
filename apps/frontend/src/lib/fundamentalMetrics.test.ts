import { describe, expect, it } from 'vitest';
import { formatMetricValue, isCuratedSection, keyMetricRows, metricLabel, SECTION_METRICS, sectionRows } from './fundamentalMetrics';

describe('SECTION_METRICS', () => {
  it('cada métrica publicada tiene nombre y explicación completos en español e inglés', () => {
    for (const [k, d] of Object.values(SECTION_METRICS).flatMap((defs) => Object.entries(defs))) {
      for (const f of ['es', 'en', 'descEs', 'descEn', 'positiveEs', 'positiveEn', 'negativeEs', 'negativeEn'] as const) {
        expect(d[f].trim().length, `${k}.${f}`).toBeGreaterThan(1);
      }
      // el texto en inglés no lleva palabras en español (p. ej. «Margen»)
      expect(`${d.descEn} ${d.positiveEn} ${d.negativeEn}`, k).not.toMatch(/\b(Margen|Ingresos|Utilidad|empresa|acción)\b/);
    }
  });
});

describe('keyMetricRows', () => {
  it('filtra y ordena: quita intradía y trading (ETFs), conserva el orden definido', () => {
    const rows = ["Day's Open ($)", 'Beta', '14-Day ATR ($)', 'Volatility', '52-Week Range ($)', '20-Day SMA ($)', '14-Day RSI', "Day's Volume", '3-Year Sharpe Ratio']
      .map((name) => ({ name, current: '1' }));
    expect(keyMetricRows(rows).map((r) => r.name)).toEqual(['Beta', '52-Week Range ($)', 'Volatility', '3-Year Sharpe Ratio']);
  });
  it('acciones: ingresos, utilidad por acción y beta', () => {
    const rows = [{ name: 'Beta' }, { name: 'EPS (TTM) ($)' }, { name: 'Revenue (TTM) (Mil $)' }, { name: 'PE Ratio' }];
    expect(keyMetricRows(rows).map((r) => r.name)).toEqual(['Revenue (TTM) (Mil $)', 'EPS (TTM) ($)', 'Beta']);
  });
});

describe('sectionRows (valuación)', () => {
  it('publica los múltiplos estándar y el rendimiento del flujo libre, en orden; quita repetidos y cálculos de GuruFocus', () => {
    const names = ['Price-to-GF-Value', 'EV-to-EBIT', 'PB Ratio', 'FCF Yield %', 'Price-to-Projected-FCF', 'PE Ratio',
      'Price-to-Operating-Cash-Flow', 'EV-to-FCF', 'Price-to-Tangible-Book', 'EV-to-Revenue', 'PE Ratio without NRI', 'Forward PE Ratio'];
    expect(sectionRows('valuation', names.map((name) => ({ name }))).map((r) => r.name))
      .toEqual(['PE Ratio', 'Forward PE Ratio', 'PE Ratio without NRI', 'PB Ratio', 'FCF Yield %', 'EV-to-Revenue']);
  });
  it('bloques no migrados quedan igual', () => {
    const rows = [{ name: 'ROE %' }, { name: 'Moat Score' }];
    expect(sectionRows('profitability', rows)).toBe(rows);
    expect(isCuratedSection('valuation')).toBe(true);
    expect(isCuratedSection('growth')).toBe(false);
  });
});

describe('metricLabel', () => {
  it('traduce y deja igual lo que no está en el diccionario', () => {
    expect(metricLabel('Revenue (TTM) (Mil $)', 'es')).toBe('Ingresos (12 meses)');
    expect(metricLabel('Revenue (TTM) (Mil $)', 'en')).toBe('Revenue (TTM)');
    expect(metricLabel('Volatility', 'es')).toBe('Volatilidad anual');
    expect(metricLabel('PE Ratio without NRI', 'es')).toBe('P/E ajustado (sin extraordinarios)');
    expect(metricLabel('EV-to-Revenue', 'en')).toBe('EV / Revenue');
    expect(metricLabel('Moat Score', 'es')).toBe('Moat Score');
  });
});

describe('formatMetricValue', () => {
  it('ingresos en millones → miles de millones', () => {
    expect(formatMetricValue('Revenue (TTM) (Mil $)', '478834', 'es')).toBe('$478.8 mil M');
    expect(formatMetricValue('Revenue (TTM) (Mil $)', '478834', 'en')).toBe('$478.8B');
    expect(formatMetricValue('Revenue (TTM) (Mil $)', '950', 'en')).toBe('$950M');
    expect(formatMetricValue('Revenue (TTM) (Mil $)', '1250000', 'es')).toBe('$1.25 billones');
  });
  it('dólares, porcentaje, ratio y rango', () => {
    expect(formatMetricValue('EPS (TTM) ($)', '8.975', 'es')).toBe('$8.98');
    expect(formatMetricValue('EPS (TTM) ($)', '-1.2', 'en')).toBe('-$1.20');
    expect(formatMetricValue('Volatility', '23.27', 'es')).toBe('23.3%');
    expect(formatMetricValue('Beta', '0.9189', 'es')).toBe('0.92');
    expect(formatMetricValue('52-Week Range ($)', '555.6 - 762.86', 'en')).toBe('$555.60 – $762.86');
    expect(formatMetricValue('PE Ratio', '28.17', 'es')).toBe('28.2x');
    expect(formatMetricValue('PEG Ratio', '1.5', 'en')).toBe('1.50');
    expect(formatMetricValue('FCF Yield %', '-1.7', 'es')).toBe('-1.7%');
  });
  it('sin definición o sin valor legible → null (formato genérico)', () => {
    expect(formatMetricValue('ROE %', '20', 'es')).toBeNull();
    expect(formatMetricValue('Beta', 'N/A', 'es')).toBeNull();
    expect(formatMetricValue('52-Week Range ($)', '555.6', 'es')).toBeNull();
  });
});
