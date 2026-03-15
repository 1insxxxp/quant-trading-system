import type { ISeriesApi } from 'lightweight-charts';
import { buildVolumeHistogramData } from '../lib/chartVolume';
import { buildMovingAverageSeries } from '../lib/indicators';
import type { IndicatorSettings, Kline } from '../types';

export interface ChartLegendItem {
  label: string;
  colorClass: string;
  value: number | null;
}

interface IndicatorSeriesMap {
  volume: ISeriesApi<'Histogram'> | null;
  ma5: ISeriesApi<'Line'> | null;
  ma10: ISeriesApi<'Line'> | null;
  ma20: ISeriesApi<'Line'> | null;
}

export interface SyncIndicatorSeriesParams {
  klines: Kline[];
  settings: IndicatorSettings;
  series: IndicatorSeriesMap;
}

export function syncIndicatorSeries(params: SyncIndicatorSeriesParams) {
  const { klines, settings, series } = params;

  series.volume?.setData(settings.volume ? buildVolumeHistogramData(klines) : []);
  series.ma5?.setData(settings.ma5 ? buildMovingAverageSeries(klines, 5) : []);
  series.ma10?.setData(settings.ma10 ? buildMovingAverageSeries(klines, 10) : []);
  series.ma20?.setData(settings.ma20 ? buildMovingAverageSeries(klines, 20) : []);
}

export function buildIndicatorLegend(
  klines: Kline[],
  settings: IndicatorSettings,
): ChartLegendItem[] {
  const items: ChartLegendItem[] = [];

  if (settings.ma5) {
    const series = buildMovingAverageSeries(klines, 5);
    items.push({
      label: 'MA5',
      colorClass: 'chart-indicator--ma5',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  if (settings.ma10) {
    const series = buildMovingAverageSeries(klines, 10);
    items.push({
      label: 'MA10',
      colorClass: 'chart-indicator--ma10',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  if (settings.ma20) {
    const series = buildMovingAverageSeries(klines, 20);
    items.push({
      label: 'MA20',
      colorClass: 'chart-indicator--ma20',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  return items;
}
