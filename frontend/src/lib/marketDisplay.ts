import type { Kline } from '../types';

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'] as const;

export interface PriceSnapshot {
  price: number | null;
  change: number | null;
  percent: number | null;
  hasChange: boolean;
}

export function interpolateNumber(
  start: number,
  end: number,
  progress: number,
): number {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return start + (end - start) * clampedProgress;
}

export function formatMarketSymbol(symbol: string): string {
  if (symbol.includes('/')) {
    return symbol;
  }

  if (symbol.includes('-')) {
    return symbol.replace('-', '/');
  }

  const quoteAsset = QUOTE_ASSETS.find(
    (suffix) => symbol.endsWith(suffix) && symbol.length > suffix.length,
  );

  if (!quoteAsset) {
    return symbol;
  }

  return `${symbol.slice(0, -quoteAsset.length)}/${quoteAsset}`;
}

export function getPriceSnapshot(
  latestPrice: number | null,
  klines: Kline[],
): PriceSnapshot {
  if (klines.length === 0 && latestPrice === null) {
    return {
      price: null,
      change: null,
      percent: null,
      hasChange: false,
    };
  }

  const ordered = [...klines].sort((a, b) => a.open_time - b.open_time);
  const firstKline = ordered[0];
  const lastKline = ordered[ordered.length - 1];
  const price = latestPrice ?? lastKline?.close ?? null;

  if (!firstKline || price === null || firstKline.open <= 0) {
    return {
      price,
      change: null,
      percent: null,
      hasChange: false,
    };
  }

  const change = price - firstKline.open;
  const percent = (change / firstKline.open) * 100;

  return {
    price,
    change,
    percent,
    hasChange: true,
  };
}
