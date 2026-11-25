import { describe, expect, it } from 'vitest';
import { formatMetricValue, KEY_METRICS, keyMetricRows, metricLabel } from './fundamentalMetrics';

describe('KEY_METRICS', () => {
  it('cada métrica publicada tiene nombre y explicación completos en español e inglés', () => {
    for (const [k, d] of Object.entries(KEY_METRICS)) {
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

describe('metricLabel', () => {
  it('traduce y deja igual lo que no está en el diccionario', () => {
    expect(metricLabel('Revenue (TTM) (Mil $)', 'es')).toBe('Ingresos (12 meses)');
    expect(metricLabel('Revenue (TTM) (Mil $)', 'en')).toBe('Revenue (TTM)');
    expect(metricLabel('Volatility', 'es')).toBe('Volatilidad anual');
    expect(metricLabel('PE Ratio', 'es')).toBe('PE Ratio');
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
  });
  it('sin definición o sin valor legible → null (formato genérico)', () => {
    expect(formatMetricValue('PE Ratio', '20', 'es')).toBeNull();
    expect(formatMetricValue('Beta', 'N/A', 'es')).toBeNull();
    expect(formatMetricValue('52-Week Range ($)', '555.6', 'es')).toBeNull();
  });
});
