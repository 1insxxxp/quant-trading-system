import type { Kline, TradeTick } from '../types/index.js';
import { TradeAggregator } from './trade-aggregator.js';

interface MarketTradeStreamOptions {
  exchange: string;
  symbol: string;
  subscribeTrades: (symbol: string, callback: (trade: TradeTick) => void) => () => void;
  loadSeedKline: (interval: string) => Promise<Kline | null>;
  onEmit: (kline: Kline) => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export class MarketTradeStream {
  private readonly aggregator: TradeAggregator;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private unsubscribe: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: MarketTradeStreamOptions) {
    this.aggregator = new TradeAggregator(options.exchange, options.symbol);
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  async addInterval(interval: string) {
    if (!this.aggregator.hasInterval(interval)) {
      const seed = await this.options.loadSeedKline(interval);
      this.aggregator.ensureInterval(interval, seed);
    }

    this.ensureUpstreamSubscription();
    this.ensureFlushTimer();
  }

  removeInterval(interval: string) {
    this.aggregator.removeInterval(interval);

    if (this.aggregator.getIntervals().length === 0) {
      this.stop();
    }
  }

  close() {
    this.stop();
  }

  private ensureUpstreamSubscription() {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.options.subscribeTrades(
      this.options.symbol,
      (trade) => {
        this.aggregator.addTrade(trade);
      },
    );
  }

  private ensureFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = this.setIntervalFn(() => {
      const emitted = this.aggregator.consumeDirtyKlines();
      emitted.forEach((kline) => {
        this.options.onEmit(kline);
      });
    }, 1000);
  }

  private stop() {
    if (this.flushTimer) {
      this.clearIntervalFn(this.flushTimer);
      this.flushTimer = null;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
