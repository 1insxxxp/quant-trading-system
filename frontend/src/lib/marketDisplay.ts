import type { Kline } from '../types';

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'] as const;

export interface PriceSnapshot {
  price: number | null;
  change: number | null;
  percent: number | null;
  hasChange: boolean;
}

interface TitleSnapshot {
  exchange: string;
  symbol: string;
  latestPrice: number | null;
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

export function formatLivePrice(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDocumentTitle({
  exchange,
  symbol,
  latestPrice,
}: TitleSnapshot): string {
  const market = `${formatMarketSymbol(symbol)} \u00b7 ${exchange.toUpperCase()}`;

  if (latestPrice === null) {
    return `${market} - 实时行情`;
  }

  return `${formatLivePrice(latestPrice)} ${market}`;
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

export function get24HourChangeSnapshot(
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
  const lastKline = ordered[ordered.length - 1];
  const price = latestPrice ?? lastKline?.close ?? null;

  if (!lastKline || price === null) {
    return {
      price,
      change: null,
      percent: null,
      hasChange: false,
    };
  }

  const latestTimestamp = typeof lastKline.close_time === 'number' ? lastKline.close_time : lastKline.open_time;
  const twentyFourHoursAgo = latestTimestamp - 24 * 60 * 60;
  const baselineKline = ordered.find(
    (kline) => {
      const klineTimestamp = typeof kline.close_time === 'number' ? kline.close_time : kline.open_time;
      return klineTimestamp >= twentyFourHoursAgo;
    },
  );

  if (!baselineKline || baselineKline.open <= 0) {
    return {
      price,
      change: null,
      percent: null,
      hasChange: false,
    };
  }

  const baselinePrice = baselineKline.open;
  const change = price - baselinePrice;
  const percent = (change / baselinePrice) * 100;

  return {
    price,
    change,
    percent,
    hasChange: true,
  };
}
