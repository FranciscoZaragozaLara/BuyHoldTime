import { describe, expect, it } from 'vitest';
import { capeBadgeType, capeBandLabel } from './capeBands';

describe('capeBands', () => {
  it('etiqueta y color por banda', () => {
    expect([25, 30, 39.79, 41, 45].map(capeBandLabel)).toEqual(['Barato', 'Justo', 'Caro', 'Elevado', 'Extremo']);
    expect([25, 36, 41].map(capeBadgeType)).toEqual(['success', 'warning', 'error']);
  });
});
