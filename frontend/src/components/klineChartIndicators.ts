import type { ISeriesApi } from 'lightweight-charts';
import { buildVolumeHistogramData } from '../lib/chartVolume';
import {
  buildMovingAverageSeries,
  buildEMASeries,
  buildRSISeries,
  buildMACDSeries,
  buildBollingerSeries,
} from '../lib/indicators';
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
  ema12: ISeriesApi<'Line'> | null;
  ema26: ISeriesApi<'Line'> | null;
  rsi: ISeriesApi<'Line'> | null;
  macdDIF: ISeriesApi<'Line'> | null;
  macdDEA: ISeriesApi<'Line'> | null;
  macdHistogram: ISeriesApi<'Histogram'> | null;
  bollingerUpper: ISeriesApi<'Line'> | null;
  bollingerMiddle: ISeriesApi<'Line'> | null;
  bollingerLower: ISeriesApi<'Line'> | null;
}

export interface SyncIndicatorSeriesParams {
  klines: Kline[];
  settings: IndicatorSettings;
  series: IndicatorSeriesMap;
}

export function syncIndicatorSeries(params: SyncIndicatorSeriesParams) {
  const { klines, settings, series } = params;

  // Volume
  series.volume?.setData(settings.volume ? buildVolumeHistogramData(klines) : []);

  // Moving Averages
  series.ma5?.setData(settings.ma5 ? buildMovingAverageSeries(klines, 5) : []);
  series.ma10?.setData(settings.ma10 ? buildMovingAverageSeries(klines, 10) : []);
  series.ma20?.setData(settings.ma20 ? buildMovingAverageSeries(klines, 20) : []);

  // EMA
  series.ema12?.setData(settings.ema12 ? buildEMASeries(klines, 12) : []);
  series.ema26?.setData(settings.ema26 ? buildEMASeries(klines, 26) : []);

  // RSI
  series.rsi?.setData(settings.rsi ? buildRSISeries(klines, 14) : []);

  // MACD
  if (settings.macd) {
    const macdData = buildMACDSeries(klines);
    series.macdDIF?.setData(macdData.dif);
    series.macdDEA?.setData(macdData.dea);
    series.macdHistogram?.setData(macdData.histogram);
  } else {
    series.macdDIF?.setData([]);
    series.macdDEA?.setData([]);
    series.macdHistogram?.setData([]);
  }

  // Bollinger Bands
  if (settings.bollinger) {
    const bollingerData = buildBollingerSeries(klines);
    series.bollingerUpper?.setData(bollingerData.upper);
    series.bollingerMiddle?.setData(bollingerData.middle);
    series.bollingerLower?.setData(bollingerData.lower);
  } else {
    series.bollingerUpper?.setData([]);
    series.bollingerMiddle?.setData([]);
    series.bollingerLower?.setData([]);
  }
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

  if (settings.ema12) {
    const series = buildEMASeries(klines, 12);
    items.push({
      label: 'EMA12',
      colorClass: 'chart-indicator--ema12',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  if (settings.ema26) {
    const series = buildEMASeries(klines, 26);
    items.push({
      label: 'EMA26',
      colorClass: 'chart-indicator--ema26',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  if (settings.rsi) {
    const series = buildRSISeries(klines, 14);
    items.push({
      label: 'RSI',
      colorClass: 'chart-indicator--rsi',
      value: series[series.length - 1]?.value ?? null,
    });
  }

  if (settings.macd) {
    const macdData = buildMACDSeries(klines);
    const lastHistogram = macdData.histogram[macdData.histogram.length - 1]?.value ?? null;
    items.push({
      label: 'MACD',
      colorClass: 'chart-indicator--macd',
      value: lastHistogram,
    });
  }

  if (settings.bollinger) {
    const bollingerData = buildBollingerSeries(klines);
    const lastUpper = bollingerData.upper[bollingerData.upper.length - 1]?.value ?? null;
    const lastLower = bollingerData.lower[bollingerData.lower.length - 1]?.value ?? null;
    const bandwidth = lastUpper !== null && lastLower !== null
      ? Math.round((lastUpper - lastLower) * 100) / 100
      : null;
    items.push({
      label: 'Bollinger',
      colorClass: 'chart-indicator--bollinger',
      value: bandwidth,
    });
  }

  return items;
}
