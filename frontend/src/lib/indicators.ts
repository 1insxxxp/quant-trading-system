import type { LineData, HistogramData } from 'lightweight-charts';
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

// EMA (指数移动平均)
export function buildEMASeries(klines: Kline[], period: number): LineData[] {
  if (period <= 0 || klines.length < period) {
    return [];
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const points: LineData[] = [];
  const multiplier = 2 / (period + 1);

  // 第一个 EMA 用 SMA 计算
  let ema = ordered.slice(0, period).reduce((sum, k) => sum + k.close, 0) / period;
  points.push({
    time: (ordered[period - 1].open_time / 1000) as LineData['time'],
    value: Math.round(ema * 100) / 100,
  });

  // 后续 EMA: EMA_today = (Price_today × Multiplier) + (EMA_yesterday × (1 - Multiplier))
  for (let i = period; i < ordered.length; i += 1) {
    ema = (ordered[i].close * multiplier) + (ema * (1 - multiplier));
    points.push({
      time: (ordered[i].open_time / 1000) as LineData['time'],
      value: Math.round(ema * 100) / 100,
    });
  }

  return points;
}

// RSI (相对强弱指数)
export function buildRSISeries(klines: Kline[], period: number = 14): LineData[] {
  if (klines.length < period + 1) {
    return [];
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const points: LineData[] = [];

  // 计算价格变化
  const changes: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    changes.push(ordered[i].close - ordered[i - 1].close);
  }

  // 初始平均涨跌
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i += 1) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  // 第一个 RSI
  let rs = avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));
  points.push({
    time: (ordered[period].open_time / 1000) as LineData['time'],
    value: Math.round(rsi * 100) / 100,
  });

  // 后续 RSI (平滑移动平均)
  for (let i = period; i < changes.length; i += 1) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    points.push({
      time: (ordered[i + 1].open_time / 1000) as LineData['time'],
      value: Math.round(rsi * 100) / 100,
    });
  }

  return points;
}

// MACD (指数平滑异同移动平均线)
export interface MACDSeries {
  dif: LineData[];
  dea: LineData[];
  histogram: HistogramData[];
}

export function buildMACDSeries(
  klines: Kline[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDSeries {
  if (klines.length < slowPeriod + signalPeriod) {
    return { dif: [], dea: [], histogram: [] };
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);

  // 计算快速和慢速 EMA
  const fastEMA = calculateEMAValues(ordered, fastPeriod);
  const slowEMA = calculateEMAValues(ordered, slowPeriod);

  // 对齐数据：从 slowPeriod-1 开始（慢速 EMA 有数据的位置）
  const dif: LineData[] = [];
  const startIndex = slowPeriod - 1;

  for (let i = startIndex; i < ordered.length; i += 1) {
    const fastIndex = i - (fastPeriod - 1);
    const slowIndex = i - (slowPeriod - 1);
    if (fastIndex >= 0 && slowIndex >= 0) {
      const difValue = fastEMA[fastIndex] - slowEMA[slowIndex];
      dif.push({
        time: (ordered[i].open_time / 1000) as LineData['time'],
        value: Math.round(difValue * 100) / 100,
      });
    }
  }

  // 计算 DEA (DIF 的 EMA)
  const dea: LineData[] = [];
  if (dif.length >= signalPeriod) {
    const signalMultiplier = 2 / (signalPeriod + 1);
    let deaValue = dif.slice(0, signalPeriod).reduce((sum, d) => sum + d.value, 0) / signalPeriod;

    dea.push({
      time: dif[signalPeriod - 1].time,
      value: Math.round(deaValue * 100) / 100,
    });

    for (let i = signalPeriod; i < dif.length; i += 1) {
      deaValue = (dif[i].value * signalMultiplier) + (deaValue * (1 - signalMultiplier));
      dea.push({
        time: dif[i].time,
        value: Math.round(deaValue * 100) / 100,
      });
    }
  }

  // 计算柱状图 (MACD = DIF - DEA)
  const histogram: HistogramData[] = [];
  for (let i = 0; i < dea.length; i += 1) {
    const difIndex = i + signalPeriod - 1;
    if (difIndex < dif.length) {
      const value = dif[difIndex].value - dea[i].value;
      histogram.push({
        time: dea[i].time,
        value: Math.round(value * 100) / 100,
      });
    }
  }

  // 对齐 dif 和 dea/histogram 的时间
  const alignedDif = dif.slice(signalPeriod - 1);

  return { dif: alignedDif, dea, histogram };
}

function calculateEMAValues(klines: Kline[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const emaValues: number[] = [];

  // 第一个 EMA 用 SMA
  let ema = klines.slice(0, period).reduce((sum, k) => sum + k.close, 0) / period;
  emaValues.push(ema);

  for (let i = period; i < klines.length; i += 1) {
    ema = (klines[i].close * multiplier) + (ema * (1 - multiplier));
    emaValues.push(ema);
  }

  return emaValues;
}

// Bollinger Bands (布林带)
export interface BollingerSeries {
  upper: LineData[];
  middle: LineData[];
  lower: LineData[];
}

export function buildBollingerSeries(
  klines: Kline[],
  period: number = 20,
  stdDev: number = 2
): BollingerSeries {
  if (klines.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const upper: LineData[] = [];
  const middle: LineData[] = [];
  const lower: LineData[] = [];

  for (let i = period - 1; i < ordered.length; i += 1) {
    // 计算 SMA (中轨)
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      sum += ordered[j].close;
    }
    const sma = sum / period;

    // 计算标准差
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      varianceSum += Math.pow(ordered[j].close - sma, 2);
    }
    const standardDeviation = Math.sqrt(varianceSum / period);

    const upperValue = sma + (stdDev * standardDeviation);
    const lowerValue = sma - (stdDev * standardDeviation);

    const time = (ordered[i].open_time / 1000) as LineData['time'];

    upper.push({ time, value: Math.round(upperValue * 100) / 100 });
    middle.push({ time, value: Math.round(sma * 100) / 100 });
    lower.push({ time, value: Math.round(lowerValue * 100) / 100 });
  }

  return { upper, middle, lower };
}
