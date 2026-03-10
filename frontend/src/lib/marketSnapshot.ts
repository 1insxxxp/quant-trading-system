import type { Kline } from '../types';

export interface MarketSummary24h {
  latestPrice: number | null;
  change: number | null;
  percent: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  quoteVolume: number | null;
  hasChange: boolean;
  hasSummary: boolean;
}

export function getMarketSummary24h(params: {
  latestPrice: number | null;
  klines: Kline[];
}): MarketSummary24h {
  const { latestPrice, klines } = params;

  if (klines.length === 0) {
    return emptySummary(latestPrice);
  }

  const ordered = [...klines].sort((left, right) => left.open_time - right.open_time);
  const latestKline = ordered[ordered.length - 1];

  if (!latestKline) {
    return emptySummary(latestPrice);
  }

  const latestTimestamp = latestKline.close_time || latestKline.open_time;
  const threshold = latestTimestamp - 24 * 60 * 60;
  const window = ordered.filter((kline) => (kline.close_time || kline.open_time) >= threshold);
  const currentPrice = latestPrice ?? latestKline.close ?? null;

  if (window.length === 0 || currentPrice === null) {
    return emptySummary(currentPrice);
  }

  const baseline = window[0];

  if (!baseline || baseline.open <= 0) {
    return emptySummary(currentPrice);
  }

  return {
    latestPrice: currentPrice,
    change: round(currentPrice - baseline.open),
    percent: round(((currentPrice - baseline.open) / baseline.open) * 100),
    high: Math.max(...window.map((kline) => kline.high)),
    low: Math.min(...window.map((kline) => kline.low)),
    volume: round(window.reduce((sum, kline) => sum + kline.volume, 0)),
    quoteVolume: round(window.reduce((sum, kline) => sum + kline.quote_volume, 0)),
    hasChange: true,
    hasSummary: true,
  };
}

function emptySummary(latestPrice: number | null): MarketSummary24h {
  return {
    latestPrice,
    change: null,
    percent: null,
    high: null,
    low: null,
    volume: null,
    quoteVolume: null,
    hasChange: false,
    hasSummary: false,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
