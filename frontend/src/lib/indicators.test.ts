import { describe, expect, it } from 'vitest';
import type { Kline } from '../types';
import { buildMovingAverageSeries } from './indicators';

function makeKline(index: number, close: number): Kline {
  return {
    exchange: 'binance',
    symbol: 'ETHUSDT',
    interval: '5m',
    open_time: 1_000_000 + index * 300,
    close_time: 1_000_300 + index * 300,
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 10 + index,
    quote_volume: 1000 + index * 100,
    is_closed: 1,
  };
}

describe('indicators', () => {
  it('builds moving average points once enough candles are available', () => {
    const klines = [1, 2, 3, 4, 5, 6].map((value, index) => makeKline(index, value));

    expect(buildMovingAverageSeries(klines, 5)).toEqual([
      { time: 1001.2, value: 3 },
      { time: 1001.5, value: 4 },
    ]);
  });
});
