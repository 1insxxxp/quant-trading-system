import type { Kline, PriceUpdate, TradeTick } from '../types/index.js';

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
  persistencePending: Kline[];
  seededFromHistory: boolean;
}

export class TradeAggregator {
  private states = new Map<string, IntervalState>();
  private latestPrice: PriceUpdate | null = null;
  private priceDirty = false;

  constructor(
    private readonly exchange: string,
    private readonly symbol: string,
  ) {}

  ensureInterval(interval: string, seed?: Kline | null) {
    if (this.states.has(interval)) {
      if (seed) {
        this.states.get(interval)!.current = cloneKline(seed);
        this.states.get(interval)!.seededFromHistory = true;
      }
      return;
    }

    this.states.set(interval, {
      interval,
      current: seed ? cloneKline(seed) : null,
      dirty: false,
      pending: [],
      persistencePending: [],
      seededFromHistory: Boolean(seed),
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

  getCurrentKline(interval: string): Kline | null {
    const current = this.states.get(interval)?.current;
    return current ? { ...current } : null;
  }

  addTrade(trade: TradeTick) {
    this.latestPrice = {
      exchange: this.exchange,
      symbol: this.symbol,
      price: trade.price,
      timestamp: trade.timestamp,
    };
    this.priceDirty = true;

    this.states.forEach((state, interval) => {
      const openTime = floorToInterval(trade.timestamp, interval);
      const closeTime = openTime + getIntervalMs(interval) - 1;

      if (!state.current) {
        state.current = createKline(this.exchange, this.symbol, interval, openTime, closeTime, trade);
        state.dirty = true;
        state.seededFromHistory = false;
        return;
      }

      if (state.current.open_time > openTime) {
        return;
      }

      if (state.current.open_time !== openTime) {
        const intervalMs = getIntervalMs(interval);
        const shouldEmitCurrent = !(state.seededFromHistory && state.current.is_closed === 1);

        if (shouldEmitCurrent) {
          const closedKline = {
            ...state.current,
            is_closed: 1,
          };
          state.pending.push(closedKline);
          state.persistencePending.push(closedKline);
        }

        let previousClose = state.current.close;
        let nextOpenTime = state.current.open_time + intervalMs;

        while (nextOpenTime < openTime) {
          const flatKline = createFlatKline(
            this.exchange,
            this.symbol,
            interval,
            nextOpenTime,
            nextOpenTime + intervalMs - 1,
            previousClose,
          );
          state.pending.push(flatKline);
          state.persistencePending.push(flatKline);
          previousClose = flatKline.close;
          nextOpenTime += intervalMs;
        }

        state.current = createKline(this.exchange, this.symbol, interval, openTime, closeTime, trade);
        state.dirty = true;
        state.seededFromHistory = false;
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
      state.seededFromHistory = false;
    });
  }

  consumeDirtyPrice(): PriceUpdate | null {
    if (!this.priceDirty || !this.latestPrice) {
      return null;
    }

    this.priceDirty = false;
    return {
      ...this.latestPrice,
    };
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

  repairGap(interval: string, repairedClosedKlines: Kline[]) {
    const state = this.states.get(interval);

    if (!state || repairedClosedKlines.length === 0) {
      return;
    }

    if (state.current && !(state.seededFromHistory && state.current.is_closed === 1)) {
      const closedCurrent = {
        ...state.current,
        is_closed: 1,
      };
      state.pending.push(closedCurrent);
      state.persistencePending.push(closedCurrent);
    }

    repairedClosedKlines.forEach((kline) => {
      const closedKline = {
        ...kline,
        is_closed: 1,
      };
      state.pending.push(closedKline);
      state.persistencePending.push(closedKline);
    });

    state.current = cloneKline(repairedClosedKlines[repairedClosedKlines.length - 1]);
    state.seededFromHistory = true;
    state.dirty = false;
  }

  consumeClosedKlinesForPersistence(): Kline[] {
    const emitted: Kline[] = [];

    this.states.forEach((state) => {
      emitted.push(...state.persistencePending.map((item) => ({ ...item })));
      state.persistencePending = [];
    });

    emitted.sort((left, right) => {
      if (left.open_time === right.open_time) {
        return left.interval.localeCompare(right.interval);
      }

      return left.open_time - right.open_time;
    });

    return emitted;
  }

  getOpenKlinesSnapshot(): Kline[] {
    const currentKlines = [...this.states.values()]
      .filter((state) => state.current && state.current.is_closed === 0)
      .map((state) => ({ ...state.current! }));

    currentKlines.sort((left, right) => {
      if (left.open_time === right.open_time) {
        return left.interval.localeCompare(right.interval);
      }

      return left.open_time - right.open_time;
    });

    return currentKlines;
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

function createFlatKline(
  exchange: string,
  symbol: string,
  interval: string,
  openTime: number,
  closeTime: number,
  previousClose: number,
): Kline {
  return {
    exchange,
    symbol,
    interval,
    open_time: openTime,
    close_time: closeTime,
    open: previousClose,
    high: previousClose,
    low: previousClose,
    close: previousClose,
    volume: 0,
    quote_volume: 0,
    trades_count: 0,
    is_closed: 1,
  };
}

function cloneKline(kline: Kline): Kline {
  return {
    ...kline,
  };
}
