import { describe, expect, it } from 'vitest';
import type { Kline } from '../types';
import { buildVolumeHistogramData } from './chartVolume';

function makeKline(overrides: Partial<Kline> = {}): Kline {
  return {
    exchange: 'binance',
    symbol: 'ETHUSDT',
    interval: '5m',
    open_time: 1_000_000,
    close_time: 1_000_300,
    open: 100,
    high: 120,
    low: 95,
    close: 110,
    volume: 25,
    quote_volume: 2600,
    is_closed: 1,
    ...overrides,
  };
}

describe('chartVolume', () => {
  it('maps klines into colored histogram data', () => {
    expect(buildVolumeHistogramData([
      makeKline({ open_time: 1_000_000, volume: 25, open: 100, close: 110 }),
      makeKline({ open_time: 1_000_300, volume: 40, open: 110, close: 90 }),
    ])).toEqual([
      { time: 1000, value: 25, color: '#0ea765' },
      { time: 1000.3, value: 40, color: '#e15656' },
    ]);
  });
});
