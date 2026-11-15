import { describe, expect, it } from 'vitest';
import { isAuthorizedRevalidate, MARKET_DATA_TAG, requestedTags } from './revalidation';

describe('revalidation', () => {
  it('solo autoriza con el secreto exacto y configurado', () => {
    expect(isAuthorizedRevalidate('abc123', 'abc123')).toBe(true);
    expect(isAuthorizedRevalidate('abc124', 'abc123')).toBe(false);
    expect(isAuthorizedRevalidate('abc', 'abc123')).toBe(false);
    expect(isAuthorizedRevalidate(null, 'abc123')).toBe(false);
    expect(isAuthorizedRevalidate('', '')).toBe(false);
    expect(isAuthorizedRevalidate('x', undefined)).toBe(false);
  });
  it('etiquetas permitidas', () => {
    expect(requestedTags(null)).toEqual([MARKET_DATA_TAG]);
    expect(requestedTags({ tags: [MARKET_DATA_TAG, 'otra', 3] })).toEqual([MARKET_DATA_TAG]);
    expect(requestedTags({ tags: [] })).toEqual([]);
  });
});
