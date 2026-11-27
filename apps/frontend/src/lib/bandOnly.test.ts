import { describe, expect, test } from 'vitest';
import { bandOnlyText } from './bandOnly';
import { formatPartValue } from './homeThermo';

describe('P/E estimado: banda en lugar del número', () => {
  test('bandas', () => {
    expect(bandOnlyText('FWD', 18.76, 'es')).toBe('Justo');
    expect(bandOnlyText('FWD', 22, 'en')).toBe('Expensive');
    expect(bandOnlyText('FWD', 15, 'es')).toBe('Barato');
    expect(bandOnlyText('CAPE', 38, 'es')).toBeNull();
    expect(bandOnlyText('FWD', null, 'es')).toBeNull();
  });
  test('home: el componente muestra la banda', () => {
    expect(formatPartValue('FWD', 18.76, 'es')).toBe('Justo');
    expect(formatPartValue('CAPE', 39.808, 'es')).toBe('39.81x');
  });
});
