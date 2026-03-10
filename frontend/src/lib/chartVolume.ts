import type { HistogramData } from 'lightweight-charts';
import type { Kline } from '../types';

export function buildVolumeHistogramData(klines: Kline[]): HistogramData[] {
  return [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .map((kline) => ({
      time: (kline.open_time / 1000) as HistogramData['time'],
      value: kline.volume,
      color: kline.close >= kline.open ? '#0ea765' : '#e15656',
    }));
}
