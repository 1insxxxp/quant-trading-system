import { describe, expect, it } from 'vitest';
import { interpolateNumber } from './marketDisplay';

describe('interpolateNumber', () => {
  it('returns the start value at progress zero and the target at progress one', () => {
    expect(interpolateNumber(100, 250, 0)).toBe(100);
    expect(interpolateNumber(100, 250, 1)).toBe(250);
  });

  it('returns an interpolated value for partial progress', () => {
    expect(interpolateNumber(100, 250, 0.5)).toBe(175);
  });
});
