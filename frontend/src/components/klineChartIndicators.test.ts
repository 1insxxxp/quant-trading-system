import { describe, expect, it, vi } from 'vitest';
import type { ISeriesApi } from 'lightweight-charts';
import type { Kline } from '../types';
import { buildIndicatorLegend, syncIndicatorSeries } from './klineChartIndicators';

function makeKlines(): Kline[] {
  return Array.from({ length: 8 }, (_, index) => ({
    exchange: 'binance',
    symbol: 'ETHUSDT',
    interval: '5m',
    open_time: 1_000_000 + index * 300,
    close_time: 1_000_300 + index * 300,
    open: 2000 + index,
    high: 2005 + index,
    low: 1997 + index,
    close: 2002 + index,
    volume: 10 + index,
    quote_volume: 20_000 + index * 10,
    is_closed: 1,
  }));
}

function createSeriesSpy() {
  return {
    setData: vi.fn(),
  } as unknown as ISeriesApi<'Histogram'>;
}

describe('klineChartIndicators', () => {
  it('syncs full-series indicator data based on enabled settings', () => {
    const volumeSeries = createSeriesSpy();
    const ma5Series = createSeriesSpy();
    const ma10Series = createSeriesSpy();
    const ma20Series = createSeriesSpy();

    syncIndicatorSeries({
      klines: makeKlines(),
      settings: {
        volume: true,
        ma5: true,
        ma10: false,
        ma20: false,
      },
      series: {
        volume: volumeSeries as unknown as ISeriesApi<'Histogram'>,
        ma5: ma5Series as unknown as ISeriesApi<'Line'>,
        ma10: ma10Series as unknown as ISeriesApi<'Line'>,
        ma20: ma20Series as unknown as ISeriesApi<'Line'>,
      },
    });

    expect(volumeSeries.setData).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ value: 10 }),
      expect.objectContaining({ value: 17 }),
    ]));
    expect(ma5Series.setData).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ value: expect.any(Number) }),
    ]));
    expect(ma10Series.setData).toHaveBeenCalledWith([]);
    expect(ma20Series.setData).toHaveBeenCalledWith([]);
  });

  it('builds legend entries only for enabled indicators', () => {
    expect(buildIndicatorLegend(makeKlines(), {
      volume: true,
      ma5: true,
      ma10: false,
      ma20: false,
    }).map((item) => item.label)).toEqual(['成交量', 'MA5']);
  });
});
