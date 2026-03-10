import { describe, expect, it } from 'vitest';
import type { CandlestickData } from 'lightweight-charts';
import { resolveChartUpdateMode, shouldLoadOlderKlines } from './klineChartData';

function makePoint(time: number): CandlestickData {
  return {
    time: time as CandlestickData['time'],
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
  };
}

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
});

describe('shouldLoadOlderKlines', () => {
  it('does not load older history before history paging is armed', () => {
    expect(
      shouldLoadOlderKlines({
        visibleFrom: 20,
        isLoadingOlderKlines: false,
        hasMoreHistoricalKlines: true,
        isHistoryPagingReady: false,
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
      }),
    ).toBe(false);
  });
});
