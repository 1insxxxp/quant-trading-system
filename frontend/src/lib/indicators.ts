import type { LineData } from 'lightweight-charts';
import type { Kline } from '../types';

export function buildMovingAverageSeries(klines: Kline[], period: number): LineData[] {
  if (period <= 0 || klines.length < period) {
    return [];
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const points: LineData[] = [];

  // 计算第一个窗口的和
  let windowSum = 0;
  for (let i = 0; i < period; i += 1) {
    windowSum += ordered[i].close;
  }

  // 添加第一个 MA 点
  points.push({
    time: (ordered[period - 1].open_time / 1000) as LineData['time'],
    value: Math.round((windowSum / period) * 100) / 100,
  });

  // 增量计算后续 MA 点：减去离开窗口的值，加上新进入窗口的值
  for (let index = period; index < ordered.length; index += 1) {
    windowSum = windowSum - ordered[index - period].close + ordered[index].close;
    points.push({
      time: (ordered[index].open_time / 1000) as LineData['time'],
      value: Math.round((windowSum / period) * 100) / 100,
    });
  }

  return points;
}
