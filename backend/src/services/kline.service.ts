import { redisCache } from '../cache/redis.js';
import { db } from '../database/postgres.js';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { ExchangeAdapter, Kline, KlineQueryResult } from '../types/index.js';
import { syncStateService } from './sync-state.service.js';

const DEFAULT_INITIAL_KLINE_LIMIT = 500;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export class KlineService {
  private adapters: Map<string, ExchangeAdapter>;

  constructor(adapters?: Map<string, ExchangeAdapter>) {
    this.adapters = adapters ?? new Map<string, ExchangeAdapter>([
      ['binance', new BinanceAdapter()],
      ['okx', new OKXAdapter()],
    ]);
  }

  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = DEFAULT_INITIAL_KLINE_LIMIT,
    before?: number,
  ): Promise<KlineQueryResult> {
    const requestLimit = limit + 1;
    let syncState: Awaited<ReturnType<typeof db.getKlineSyncState>> | null = null;
    let cached: Kline[] = [];

    const redisKlines = await redisCache.getKlines(exchange, symbol, interval, requestLimit);
    if (redisKlines && redisKlines.length >= requestLimit) {
      return {
        klines: redisKlines.slice(-limit),
        source: 'cache',
        hasMore: true,
      };
    }

    try {
      syncState = await db.getKlineSyncState(exchange, symbol, interval);
      cached = normalizeKlines(
        await db.getKlines(exchange, symbol, interval, requestLimit, before) as Kline[],
      );
    } catch (error: any) {
      console.warn(`DB unavailable for klines ${exchange}:${symbol}:${interval}: ${error.message}`);
    }

    if (cached.length >= requestLimit) {
      const persistedHasMore = syncState?.has_more_history ?? true;
      return {
        klines: cached.slice(-limit),
        source: 'cache',
        hasMore: persistedHasMore,
      };
    }

    try {
      const adapter = this.adapters.get(exchange);

      if (!adapter) {
        console.warn(`Missing exchange adapter: ${exchange}`);
        return this.buildFallbackResult(cached, limit);
      }

      const remoteKlines = await this.fetchPagedRemoteKlines(
        adapter,
        symbol,
        interval,
        requestLimit,
        before,
      );
      const mergedKlines = normalizeKlines([...cached, ...remoteKlines]);
      const hasMore = remoteKlines.length >= requestLimit;
      const responseKlines = mergedKlines.slice(-limit);

      if (remoteKlines.length > 0) {
        try {
          await this.saveKlines(remoteKlines);
          await redisCache.setKlines(exchange, symbol, interval, mergedKlines);
          await syncStateService.recordHistorySyncSuccess(
            exchange,
            symbol,
            interval,
            mergedKlines,
            hasMore,
            'remote',
          );
        } catch (persistError: any) {
          console.warn(`Persist remote klines skipped: ${persistError.message}`);
        }
        return {
          klines: responseKlines,
          source: responseKlines.length === cached.length ? 'cache' : 'remote',
          hasMore,
        };
      }

      try {
        await syncStateService.recordHistorySyncSuccess(
          exchange,
          symbol,
          interval,
          cached,
          false,
          'cache',
        );
      } catch (persistError: any) {
        console.warn(`Persist sync state skipped: ${persistError.message}`);
      }
      return this.buildFallbackResult(cached, limit, false);
    } catch (error: any) {
      console.error('Failed to load remote klines:', error.message);
      try {
        await syncStateService.recordHistorySyncError(exchange, symbol, interval, error);
      } catch (persistError: any) {
        console.warn(`Persist sync error skipped: ${persistError.message}`);
      }
      return this.buildFallbackResult(cached, limit, syncState?.has_more_history ?? false);
    }
  }

  async saveKline(kline: Kline): Promise<void> {
    await db.saveKline(kline);
  }

  async saveKlines(klines: Kline[]): Promise<void> {
    if (klines.length === 0) {
      return;
    }

    await db.saveKlines(klines);
  }

  async getLatestCachedKline(
    exchange: string,
    symbol: string,
    interval: string,
  ): Promise<Kline | null> {
    try {
      const klines = await db.getKlines(exchange, symbol, interval, 1) as Kline[];
      return klines[0] ?? null;
    } catch (error: any) {
      console.warn(`DB unavailable for latest cached kline ${exchange}:${symbol}:${interval}: ${error.message}`);
      return null;
    }
  }

  async recoverGapKlines(
    exchange: string,
    symbol: string,
    interval: string,
    fromExclusiveOpenTime: number,
    toExclusiveOpenTime: number,
  ): Promise<Kline[]> {
    const intervalMs = getIntervalMs(interval);
    const missingCount = Math.max(
      0,
      Math.floor((toExclusiveOpenTime - fromExclusiveOpenTime) / intervalMs) - 1,
    );

    if (missingCount === 0) {
      return [];
    }

    const result = await this.getKlines(
      exchange,
      symbol,
      interval,
      missingCount,
      toExclusiveOpenTime,
    );

    return normalizeKlines(result.klines).filter((kline) => (
      kline.open_time > fromExclusiveOpenTime &&
      kline.open_time < toExclusiveOpenTime
    ));
  }

  getExchanges(): string[] {
    return ['binance', 'okx'];
  }

  async getSymbols(exchange?: string, type?: string): Promise<any[]> {
    try {
      return await db.getSymbols(exchange, type);
    } catch (error: any) {
      console.warn(`DB unavailable for symbols query: ${error.message}`);
    }

    const exchanges = exchange ? [exchange] : this.getExchanges();
    const resolvedType = type ?? 'spot';
    const results = await Promise.all(
      exchanges.map(async (exchangeName) => {
        const adapter = this.adapters.get(exchangeName);
        if (!adapter) {
          return [];
        }

        try {
          const symbols = await adapter.getSymbols();
          return symbols.filter((item) => item.type === resolvedType);
        } catch (error: any) {
          console.error(`Failed to fetch symbols from ${exchangeName}:`, error.message);
          return [];
        }
      }),
    );

    return results.flat();
  }

  private buildFallbackResult(cached: Kline[], limit: number, persistedHasMore: boolean = false): KlineQueryResult {
    const hasMore = cached.length > limit || persistedHasMore;
    const klines = cached.slice(-limit);

    if (cached.length > 0) {
      return {
        klines,
        source: 'cache',
        hasMore,
      };
    }

    return {
      klines: [],
      source: 'cache',
      hasMore: false,
    };
  }

  private async fetchPagedRemoteKlines(
    adapter: ExchangeAdapter,
    symbol: string,
    interval: string,
    limit: number,
    before?: number,
  ): Promise<Kline[]> {
    const page = normalizeKlines(
      await adapter.getKlines(symbol, interval, limit, before),
    );

    return page;
  }
}

export const klineService = new KlineService();

function normalizeKlines(klines: Kline[]): Kline[] {
  const deduped = new Map<number, Kline>();

  [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .forEach((kline) => {
      deduped.set(kline.open_time, kline);
    });

  return [...deduped.values()];
}

function getIntervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? DEFAULT_INTERVAL_MS;
}
