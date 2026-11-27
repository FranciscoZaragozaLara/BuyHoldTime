import { publicSource } from './public-source';

describe('fuente en respuestas públicas', () => {
  test('FRED y CNN (citada) se nombran; respaldo de la BD y sin dato se conservan', () => {
    expect(publicSource('FRED')).toBe('FRED');
    expect(publicSource('CNN')).toBe('CNN');
    expect(publicSource('db-fallback')).toBe('db-fallback');
    expect(publicSource('none')).toBe('none');
  });
  test('proveedores comerciales e índices propietarios → live', () => {
    for (const s of ['yahoo', 'yahoo ^VIX', 'yahoo CL=F', '', null, undefined]) expect(publicSource(s)).toBe('live');
  });
});
