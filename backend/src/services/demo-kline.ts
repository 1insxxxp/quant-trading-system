import type { Kline } from '../types/index.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 68000,
  ETHUSDT: 3600,
};

interface DemoKlineOptions {
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
  now?: number;
}

export function buildDemoKlines({
  exchange,
  symbol,
  interval,
  limit,
  now = Date.now(),
}: DemoKlineOptions): Kline[] {
  const intervalMs = getIntervalMs(interval);
  const count = Math.max(1, Math.min(limit, 1000));
  const normalizedSymbol = symbol.toUpperCase();
  const basePrice = BASE_PRICES[normalizedSymbol] ?? 100;
  const anchor = Math.floor(now / intervalMs) * intervalMs;
  const seed = hashCode(`${exchange}:${normalizedSymbol}:${interval}`);
  const klines: Kline[] = [];

  let previousClose = basePrice * (1 + ((seed % 17) - 8) / 500);

  for (let index = 0; index < count; index += 1) {
    const openTime = anchor - intervalMs * (count - index);
    const closeTime = openTime + intervalMs;
    const wave = Math.sin((index + seed) / 5) * basePrice * 0.009;
    const drift = ((index - count / 2) / count) * basePrice * 0.035;
    const noise = (((seed + index * 13) % 9) - 4) * basePrice * 0.0014;
    const open = clampPrice(previousClose);
    const close = clampPrice(basePrice + drift + wave + noise);
    const wick = basePrice * (0.0025 + ((index + seed) % 4) * 0.0008);
    const high = clampPrice(Math.max(open, close) + wick);
    const low = clampPrice(Math.min(open, close) - wick);
    const volume = 180 + ((seed + index * 19) % 60) * 7;
    const quoteVolume = volume * close;

    klines.push({
      exchange,
      symbol: normalizedSymbol,
      interval,
      open_time: openTime,
      close_time: closeTime,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: round(volume),
      quote_volume: round(quoteVolume),
      trades_count: 120 + ((seed + index * 11) % 40),
      is_closed: 1,
    });

    previousClose = close;
  }

  return klines;
}

export function getIntervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? DEFAULT_INTERVAL_MS;
}

function clampPrice(value: number): number {
  return Math.max(value, 0.01);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function hashCode(input: string): number {
  return [...input].reduce((result, char) => {
    return (result * 31 + char.charCodeAt(0)) % 100000;
  }, 7);
}
