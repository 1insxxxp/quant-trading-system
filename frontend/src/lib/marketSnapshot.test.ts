import { describe, expect, it } from 'vitest';
import type { Kline } from '../types';
import { getMarketSummary24h } from './marketSnapshot';

function makeKline(overrides: Partial<Kline> = {}): Kline {
  return {
    exchange: 'binance',
    symbol: 'ETHUSDT',
    interval: '1h',
    open_time: 1_000_000,
    close_time: 1_003_600,
    open: 2050,
    high: 2065,
    low: 2020,
    close: 2040,
    volume: 10,
    quote_volume: 20_400,
    is_closed: 1,
    ...overrides,
  };
}

describe('marketSnapshot', () => {
  it('builds a full 24h summary from the latest 24-hour window', () => {
    const summary = getMarketSummary24h({
      latestPrice: 2025.27,
      klines: [
        makeKline({
          open_time: 1_000_000,
          close_time: 1_003_600,
          open: 2050,
          high: 2065,
          low: 2020,
          close: 2040,
          volume: 10,
          quote_volume: 20_400,
        }),
        makeKline({
          open_time: 1_040_000,
          close_time: 1_043_600,
          open: 2040,
          high: 2075,
          low: 2015,
          close: 2035,
          volume: 12,
          quote_volume: 24_420,
        }),
        makeKline({
          open_time: 1_082_800,
          close_time: 1_086_400,
          open: 2020,
          high: 2030,
          low: 1980,
          close: 2022,
          volume: 14,
          quote_volume: 28_308,
        }),
      ],
    });

    expect(summary).toEqual({
      latestPrice: 2025.27,
      change: -24.73,
      percent: -1.21,
      high: 2075,
      low: 1980,
      volume: 36,
      quoteVolume: 73128,
      hasChange: true,
      hasSummary: true,
    });
  });
});
