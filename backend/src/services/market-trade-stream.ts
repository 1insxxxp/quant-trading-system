import type { Kline, PriceUpdate, TradeTick } from '../types/index.js';
import { getIntervalMs, TradeAggregator } from './trade-aggregator.js';

interface MarketTradeStreamOptions {
  exchange: string;
  symbol: string;
  subscribeTrades: (symbol: string, callback: (trade: TradeTick) => void) => () => void;
  loadSeedKline: (interval: string) => Promise<Kline | null>;
  onEmitPrice: (priceUpdate: PriceUpdate) => void;
  onEmitKline: (kline: Kline) => void;
  persistClosedKlines?: (klines: Kline[]) => Promise<void> | void;
  checkpointOpenKlines?: (klines: Kline[]) => Promise<void> | void;
  recoverGapKlines?: (
    interval: string,
    fromExclusiveOpenTime: number,
    toExclusiveOpenTime: number,
  ) => Promise<Kline[]>;
  checkpointIntervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

const DISPLAY_FLUSH_INTERVAL_MS = 200;
const DEFAULT_CHECKPOINT_INTERVAL_MS = 5_000;

export class MarketTradeStream {
  private readonly aggregator: TradeAggregator;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly checkpointIntervalMs: number;
  private unsubscribe: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointPromise: Promise<void> | null = null;
  private checkpointRetryRequested = false;
  private recoveryPromise: Promise<void> | null = null;

  constructor(private readonly options: MarketTradeStreamOptions) {
    this.aggregator = new TradeAggregator(options.exchange, options.symbol);
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS;
  }

  async addInterval(interval: string) {
    if (!this.aggregator.hasInterval(interval)) {
      const seed = await this.options.loadSeedKline(interval);
      this.aggregator.ensureInterval(interval, seed);
    }

    this.ensureUpstreamSubscription();
    this.ensureFlushTimer();
    this.ensureCheckpointTimer();
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
        if (this.recoveryPromise) {
          const queuedRecovery = this.recoveryPromise.then(async () => {
            await this.handleTradeRecovery(trade);
          });
          this.trackRecoveryPromise(queuedRecovery);
          return;
        }

        const recovery = this.handleTradeRecovery(trade);

        if (recovery) {
          this.trackRecoveryPromise(recovery);
        }
      },
    );
  }

  private handleTradeRecovery(trade: TradeTick): Promise<void> | null {
    const recovery = this.recoverRealtimeGaps(trade);

    if (!recovery) {
      this.processTrade(trade);
      return null;
    }

    return recovery.then(() => {
      this.processTrade(trade);
    });
  }

  private trackRecoveryPromise(promise: Promise<void>) {
    const activeRecovery = promise.finally(() => {
      if (this.recoveryPromise === activeRecovery) {
        this.recoveryPromise = null;
      }
    });
    this.recoveryPromise = activeRecovery;
  }

  private processTrade(trade: TradeTick) {
    this.aggregator.addTrade(trade);
    this.persistClosedKlines();
  }

  private ensureFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = this.setIntervalFn(() => {
      if (this.recoveryPromise) {
        return;
      }

      const priceUpdate = this.aggregator.consumeDirtyPrice();
      if (priceUpdate) {
        this.options.onEmitPrice(priceUpdate);
      }

      const emitted = this.aggregator.consumeDirtyKlines();
      emitted.forEach((kline) => {
        this.options.onEmitKline(kline);
      });
    }, DISPLAY_FLUSH_INTERVAL_MS);
  }

  private ensureCheckpointTimer() {
    if (this.checkpointTimer) {
      return;
    }

    this.checkpointTimer = this.setIntervalFn(() => {
      this.runCheckpoint();
    }, this.checkpointIntervalMs);
  }

  private persistClosedKlines() {
    const closedKlines = this.aggregator.consumeClosedKlinesForPersistence();

    if (closedKlines.length === 0 || !this.options.persistClosedKlines) {
      return;
    }

    void Promise.resolve(this.options.persistClosedKlines(closedKlines)).catch(() => {
      // Persistence failures are handled by the injected callback.
    });
  }

  private runCheckpoint() {
    if (!this.options.checkpointOpenKlines) {
      return;
    }

    if (this.checkpointPromise) {
      this.checkpointRetryRequested = true;
      return;
    }

    const openKlines = this.aggregator.getOpenKlinesSnapshot();

    if (openKlines.length === 0) {
      return;
    }

    this.checkpointPromise = Promise.resolve(this.options.checkpointOpenKlines(openKlines))
      .catch(() => {
        // Persistence failures are handled by the injected callback.
      })
      .finally(() => {
        this.checkpointPromise = null;

        if (this.checkpointRetryRequested) {
          this.checkpointRetryRequested = false;
          this.runCheckpoint();
        }
      });
  }

  private recoverRealtimeGaps(trade: TradeTick): Promise<void> | null {
    if (!this.options.recoverGapKlines) {
      return null;
    }

    const intervals = this.aggregator.getIntervals();
    const gapsToRecover = intervals
      .map((interval) => {
        const current = this.aggregator.getCurrentKline(interval);

        if (!current) {
          return null;
        }

        const intervalMs = getIntervalMs(interval);
        const nextTradeOpenTime = Math.floor(trade.timestamp / intervalMs) * intervalMs;

        if (nextTradeOpenTime <= current.open_time + intervalMs) {
          return null;
        }

        return {
          interval,
          current,
          nextTradeOpenTime,
        };
      })
      .filter((entry): entry is {
        interval: string;
        current: Kline;
        nextTradeOpenTime: number;
      } => entry !== null);

    if (gapsToRecover.length === 0) {
      return null;
    }

    return (async () => {
      for (const gap of gapsToRecover) {
        const recoveredKlines = await this.options.recoverGapKlines!(
          gap.interval,
          gap.current.open_time,
          gap.nextTradeOpenTime,
        );
        const repairedClosedKlines = buildRecoveredGapSequence({
          current: gap.current,
          nextTradeOpenTime: gap.nextTradeOpenTime,
          recoveredKlines,
        });

        this.aggregator.repairGap(gap.interval, repairedClosedKlines);
        this.persistClosedKlines();
      }
    })();
  }

  private stop() {
    if (this.flushTimer) {
      this.clearIntervalFn(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.checkpointTimer) {
      this.clearIntervalFn(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

function buildRecoveredGapSequence(params: {
  current: Kline;
  nextTradeOpenTime: number;
  recoveredKlines: Kline[];
}): Kline[] {
  const { current, nextTradeOpenTime, recoveredKlines } = params;
  return recoveredKlines
    .filter((kline) => kline.open_time > current.open_time && kline.open_time < nextTradeOpenTime)
    .sort((left, right) => left.open_time - right.open_time)
    .map((kline) => ({
      ...kline,
      is_closed: 1,
    }));
}
