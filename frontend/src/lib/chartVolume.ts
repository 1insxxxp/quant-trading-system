import type { HistogramData } from 'lightweight-charts';
import type { Kline } from '../types';

// 成交量柱状图颜色（带透明度，与主图 K 线颜色区分）
// 主图 K 线：涨 #3ddc97 / 跌 #ff6b7c（高饱和度）
// 副图成交量：涨 rgba(61, 220, 151, 0.4) / 跌 rgba(255, 107, 124, 0.4)（低饱和度 + 透明）
const VOLUME_UP_COLOR = 'rgba(61, 220, 151, 0.4)';
const VOLUME_DOWN_COLOR = 'rgba(255, 107, 124, 0.4)';

export function buildVolumeHistogramData(klines: Kline[]): HistogramData[] {
  return [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .map((kline) => ({
      time: (kline.open_time / 1000) as HistogramData['time'],
      value: kline.volume,
      color: kline.close >= kline.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
    }));
}
