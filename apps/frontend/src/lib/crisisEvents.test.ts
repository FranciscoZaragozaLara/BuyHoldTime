import { describe, expect, test } from 'vitest';
import { snapToTime } from './crisisEvents';

describe('snapToTime', () => {
  const snap = snapToTime(['2008-10-31', '2008-09-30', '2008-11-28']);
  test('ancla al último tiempo de la serie <= fecha', () => {
    expect(snap('2008-10-15')).toBe('2008-09-30');
    expect(snap('2008-10-31')).toBe('2008-10-31');
    expect(snap('2009-01-01')).toBe('2008-11-28');
  });
  test('antes del primer punto: el primero de la serie', () => {
    expect(snap('2000-01-01')).toBe('2008-09-30');
  });
});
