import { describe, it, expect } from 'vitest';
import { validateKline, filterValidKlines, mergeRealtimeKline } from './klineValidator';
import type { Kline } from '../types';

function createTestKline(overrides: Partial<Kline> = {}): Kline {
  const now = Date.now();
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1h',
    open_time: now - 3600000,
    close_time: now,
    open: 50000,
    high: 51000,
    low: 49000,
    close: 50500,
    volume: 1000,
    quote_volume: 50000000,
    trades_count: 500,
    is_closed: 1,
    ...overrides,
  };
}

describe('validateKline', () => {
  it('should accept valid kline', () => {
    const kline = createTestKline();
    const result = validateKline(kline);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject kline with zero open price', () => {
    const kline = createTestKline({ open: 0 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid open price: 0');
  });

  it('should reject kline with negative high price', () => {
    const kline = createTestKline({ high: -100 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid high price: -100');
  });

  it('should reject kline when high < open', () => {
    const kline = createTestKline({ high: 49000, open: 50000 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('High (49000) < Open (50000)');
  });

  it('should reject kline when high < close', () => {
    const kline = createTestKline({ high: 49000, close: 50500 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('High (49000) < Close (50500)');
  });

  it('should reject kline when low > open', () => {
    const kline = createTestKline({ low: 51000, open: 50000 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Low (51000) > Open (50000)');
  });

  it('should reject kline when low > close', () => {
    const kline = createTestKline({ low: 51000, close: 50500 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Low (51000) > Close (50500)');
  });

  it('should reject kline when high < low', () => {
    const kline = createTestKline({ high: 48000, low: 52000 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('High (48000) < Low (52000)');
  });

  it('should reject kline with negative volume', () => {
    const kline = createTestKline({ volume: -100 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid volume: -100');
  });

  it('should reject kline with timestamp too far in the future', () => {
    const now = Date.now();
    const kline = createTestKline({ open_time: now + 10 * 60 * 1000, close_time: now + 10 * 60 * 1000 + 3600000 });
    const result = validateKline(kline);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('too far in the future'))).toBe(true);
  });
});

describe('filterValidKlines', () => {
  it('should filter out invalid klines', () => {
    const klines = [
      createTestKline(),
      createTestKline({ open: 0 }),
      createTestKline(),
    ];

    const validKlines = filterValidKlines(klines);
    expect(validKlines).toHaveLength(2);
  });

  it('should return all klines when all valid', () => {
    const klines = [
      createTestKline(),
      createTestKline(),
    ];

    const validKlines = filterValidKlines(klines);
    expect(validKlines).toHaveLength(2);
  });

  it('should return empty array when all invalid', () => {
    const klines = [
      createTestKline({ open: 0 }),
      createTestKline({ high: -100 }),
    ];

    const validKlines = filterValidKlines(klines);
    expect(validKlines).toHaveLength(0);
  });
});

describe('mergeRealtimeKline', () => {
  it('should merge valid realtime kline', () => {
    const now = Date.now();
    const existing = createTestKline({ open_time: now, high: 51000, low: 49000, volume: 1000, close_time: now + 3600000 });
    const incoming = createTestKline({ open_time: now, high: 52000, low: 48000, volume: 1500, close_time: now + 3600000 });

    const merged = mergeRealtimeKline(existing, incoming);

    expect(merged).not.toBeNull();
    expect(merged?.open).toBe(50000); // Keep existing open
    expect(merged?.high).toBe(52000); // Max of both
    expect(merged?.low).toBe(48000); // Min of both
    expect(merged?.volume).toBe(1500); // Max of both
  });

  it('should reject invalid realtime kline', () => {
    const existing = createTestKline();
    const incoming = createTestKline({ open: 0 }); // Invalid

    const merged = mergeRealtimeKline(existing, incoming);

    expect(merged).toBeNull();
  });
});
