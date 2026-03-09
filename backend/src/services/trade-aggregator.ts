import type { Kline, TradeTick } from '../types/index.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

interface IntervalState {
  interval: string;
  current: Kline | null;
  dirty: boolean;
  pending: Kline[];
}

export class TradeAggregator {
  private states = new Map<string, IntervalState>();

  constructor(
    private readonly exchange: string,
    private readonly symbol: string,
  ) {}

  ensureInterval(interval: string, seed?: Kline | null) {
    if (this.states.has(interval)) {
      if (seed) {
        this.states.get(interval)!.current = cloneKline(seed);
      }
      return;
    }

    this.states.set(interval, {
      interval,
      current: seed ? cloneKline(seed) : null,
      dirty: false,
      pending: [],
    });
  }

  removeInterval(interval: string) {
    this.states.delete(interval);
  }

  hasInterval(interval: string): boolean {
    return this.states.has(interval);
  }

  getIntervals(): string[] {
    return [...this.states.keys()];
  }

  addTrade(trade: TradeTick) {
    this.states.forEach((state, interval) => {
      const openTime = floorToInterval(trade.timestamp, interval);
      const closeTime = openTime + getIntervalMs(interval) - 1;

      if (!state.current) {
        state.current = createKline(this.exchange, this.symbol, interval, openTime, closeTime, trade);
        state.dirty = true;
        return;
      }

      if (state.current.open_time !== openTime) {
        state.pending.push({
          ...state.current,
          is_closed: 1,
        });
        state.current = createKline(this.exchange, this.symbol, interval, openTime, closeTime, trade);
        state.dirty = true;
        return;
      }

      state.current.high = Math.max(state.current.high, trade.price);
      state.current.low = Math.min(state.current.low, trade.price);
      state.current.close = trade.price;
      state.current.volume += trade.quantity;
      state.current.quote_volume += trade.quote_volume;
      state.current.trades_count = (state.current.trades_count ?? 0) + 1;
      state.current.is_closed = 0;
      state.dirty = true;
    });
  }

  consumeDirtyKlines(): Kline[] {
    const emitted: Kline[] = [];

    this.states.forEach((state) => {
      emitted.push(...state.pending.map((item) => ({ ...item })));
      state.pending = [];

      if (state.dirty && state.current) {
        emitted.push({ ...state.current });
        state.dirty = false;
      }
    });

    emitted.sort((left, right) => {
      if (left.open_time === right.open_time) {
        return left.interval.localeCompare(right.interval);
      }

      return left.open_time - right.open_time;
    });

    return emitted;
  }
}

export function getIntervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? DEFAULT_INTERVAL_MS;
}

function floorToInterval(timestamp: number, interval: string): number {
  const intervalMs = getIntervalMs(interval);
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

function createKline(
  exchange: string,
  symbol: string,
  interval: string,
  openTime: number,
  closeTime: number,
  trade: TradeTick,
): Kline {
  return {
    exchange,
    symbol,
    interval,
    open_time: openTime,
    close_time: closeTime,
    open: trade.price,
    high: trade.price,
    low: trade.price,
    close: trade.price,
    volume: trade.quantity,
    quote_volume: trade.quote_volume,
    trades_count: 1,
    is_closed: 0,
  };
}

function cloneKline(kline: Kline): Kline {
  return {
    ...kline,
  };
}
