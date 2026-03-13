import { describe, expect, it } from 'vitest';
import type { CandlestickData } from 'lightweight-charts';
import { buildCandlestickData, resolveChartUpdateMode, shouldLoadOlderKlines } from './klineChartData';
import type { Kline } from '../types';

function makePoint(time: number): CandlestickData {
  return {
    time: time as CandlestickData['time'],
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
  };
}

function makeKline(openTime: number, close: number = 100): Kline {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    open_time: openTime,
    close_time: openTime + 59_999,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    quote_volume: close,
    is_closed: 1,
  };
}

describe('buildCandlestickData', () => {
  it('fills missing display intervals with flat zero-volume candles', () => {
    const data = buildCandlestickData(
      [
        makeKline(60_000, 100),
        makeKline(240_000, 105),
      ],
    );

    expect(data.map((item) => Number(item.time))).toEqual([60, 120, 180, 240]);
    expect(data[1]).toMatchObject({
      open: 100,
      high: 100,
      low: 100,
      close: 100,
    });
    expect(data[2]).toMatchObject({
      open: 100,
      high: 100,
      low: 100,
      close: 100,
    });
  });
});

describe('resolveChartUpdateMode', () => {
  it('forces a full replace when the active market key changes', () => {
    const previousData = [makePoint(1), makePoint(2)];
    const nextData = [makePoint(1), makePoint(2)];

    expect(
      resolveChartUpdateMode({
        previousData,
        nextData,
        previousMarketKey: 'binance:BTCUSDT:1h',
        nextMarketKey: 'binance:ETHUSDT:1h',
      }),
    ).toBe('replace');
  });

  it('detects prepended historical bars for the same market', () => {
    const previousData = [makePoint(3), makePoint(4)];
    const nextData = [makePoint(1), makePoint(2), makePoint(3), makePoint(4)];

    expect(
      resolveChartUpdateMode({
        previousData,
        nextData,
        previousMarketKey: 'binance:BTCUSDT:1h',
        nextMarketKey: 'binance:BTCUSDT:1h',
      }),
    ).toBe('prepend');
  });

  it('detects repaired candles inserted within the current visible range', () => {
    const previousData = [makePoint(1), makePoint(4)];
    const nextData = [makePoint(1), makePoint(2), makePoint(3), makePoint(4)];

    expect(
      resolveChartUpdateMode({
        previousData,
        nextData,
        previousMarketKey: 'binance:BTCUSDT:1h',
        nextMarketKey: 'binance:BTCUSDT:1h',
      }),
    ).toBe('repair');
  });

  it('treats non-tail mutations as a repair instead of an update-last', () => {
    const previousData = [makePoint(1), makePoint(2), makePoint(3)];
    const nextData = [makePoint(1), makePoint(2), { ...makePoint(3), open: 2, high: 3, low: 1, close: 2.5 }];

    expect(
      resolveChartUpdateMode({
        previousData,
        nextData,
        previousMarketKey: 'binance:BTCUSDT:1h',
        nextMarketKey: 'binance:BTCUSDT:1h',
      }),
    ).toBe('update-last');
  });
});

describe('shouldLoadOlderKlines', () => {
  it('does not load older history before history paging is armed', () => {
    expect(
      shouldLoadOlderKlines({
        visibleFrom: 20,
        isLoadingOlderKlines: false,
        hasMoreHistoricalKlines: true,
        isHistoryPagingReady: false,
        hasOlderLoadError: false,
      }),
    ).toBe(false);
  });

  it('loads older history when the visible range reaches the left edge threshold', () => {
    expect(
      shouldLoadOlderKlines({
        visibleFrom: 20,
        isLoadingOlderKlines: false,
        hasMoreHistoricalKlines: true,
        isHistoryPagingReady: true,
        hasOlderLoadError: false,
      }),
    ).toBe(true);
  });

  it('does not load while an older-history request is already running', () => {
    expect(
      shouldLoadOlderKlines({
        visibleFrom: 20,
        isLoadingOlderKlines: true,
        hasMoreHistoricalKlines: true,
        isHistoryPagingReady: true,
        hasOlderLoadError: false,
      }),
    ).toBe(false);
  });

  it('does not auto-load while a previous older-history request is in error state', () => {
    expect(
      shouldLoadOlderKlines({
        visibleFrom: 20,
        isLoadingOlderKlines: false,
        hasMoreHistoricalKlines: true,
        isHistoryPagingReady: true,
        hasOlderLoadError: true,
      }),
    ).toBe(false);
  });
});
