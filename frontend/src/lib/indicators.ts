import type { LineData } from 'lightweight-charts';
import type { Kline } from '../types';

export function buildMovingAverageSeries(klines: Kline[], period: number): LineData[] {
  if (period <= 0) {
    return [];
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const points: LineData[] = [];

  for (let index = period - 1; index < ordered.length; index += 1) {
    const window = ordered.slice(index - period + 1, index + 1);
    const average = window.reduce((sum, item) => sum + item.close, 0) / period;
    points.push({
      time: (ordered[index].open_time / 1000) as LineData['time'],
      value: Math.round(average * 100) / 100,
    });
  }

  return points;
}
