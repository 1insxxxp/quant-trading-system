import { describe, expect, it } from 'vitest';
import type { CandlestickData } from 'lightweight-charts';
import {
  buildCandlestickData,
  isNearHistoryLoadEdge,
  resolveChartUpdateMode,
  shouldShowDetachedRealtimePriceLine,
  resolveVisibleRangeAfterPrepend,
  shouldLoadOlderKlines,
} from './klineChartData';
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
  it('treats the left-edge threshold as near-edge for auto pagination', () => {
    expect(isNearHistoryLoadEdge(0)).toBe(true);
    expect(isNearHistoryLoadEdge(20)).toBe(true);
    expect(isNearHistoryLoadEdge(80)).toBe(false);
    expect(isNearHistoryLoadEdge(null)).toBe(false);
  });

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

describe('resolveVisibleRangeAfterPrepend', () => {
  it('preserves the current viewport after prepending history so one edge touch loads one page', () => {
    expect(
      resolveVisibleRangeAfterPrepend({
        visibleRange: { from: 0, to: 80 },
        prependedCount: 1000,
        keepPinnedToLeftEdge: true,
      }),
    ).toEqual({ from: 1000, to: 1080 });
  });

  it('preserves the current visible bars when not edge-pinned', () => {
    expect(
      resolveVisibleRangeAfterPrepend({
        visibleRange: { from: 12, to: 92 },
        prependedCount: 1000,
        keepPinnedToLeftEdge: false,
      }),
    ).toEqual({ from: 1012, to: 1092 });
  });

  it('returns null when there is no previous visible range', () => {
    expect(
      resolveVisibleRangeAfterPrepend({
        visibleRange: null,
        prependedCount: 1000,
        keepPinnedToLeftEdge: true,
      }),
    ).toBeNull();
  });
});

describe('shouldShowDetachedRealtimePriceLine', () => {
  it('shows the realtime marker when the viewport is away from the latest candles', () => {
    expect(
      shouldShowDetachedRealtimePriceLine({
        latestPrice: 2077.66,
        latestLogicalIndex: 120,
        visibleTo: 92,
      }),
    ).toBe(true);
  });

  it('hides the realtime marker when the viewport is still near realtime', () => {
    expect(
      shouldShowDetachedRealtimePriceLine({
        latestPrice: 2077.66,
        latestLogicalIndex: 120,
        visibleTo: 118,
      }),
    ).toBe(false);
  });

  it('hides the realtime marker when there is no realtime price or no chart data', () => {
    expect(
      shouldShowDetachedRealtimePriceLine({
        latestPrice: null,
        latestLogicalIndex: 120,
        visibleTo: 90,
      }),
    ).toBe(false);

    expect(
      shouldShowDetachedRealtimePriceLine({
        latestPrice: 2077.66,
        latestLogicalIndex: null,
        visibleTo: 90,
      }),
    ).toBe(false);
  });
});
