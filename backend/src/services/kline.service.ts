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

    // 1. 无 before 参数时，先查 Redis（最新数据缓存）
    if (before === undefined) {
      const redisKlines = await redisCache.getKlines(exchange, symbol, interval, requestLimit);
      if (redisKlines && redisKlines.length >= requestLimit) {
        return {
          klines: redisKlines.slice(-limit),
          source: 'cache',
          hasMore: true,
        };
      }
    }

    // 2. 有 before 参数（历史数据加载）时，优先查 DB（预热数据已在库中）
    const dbResult = await this.queryKlinesFromDb(exchange, symbol, interval, requestLimit, before);
    const cleanedDbResult = sanitizeKlineWindow(dbResult ?? [], interval);
    const dbWindowNeedsRemoteRepair = cleanedDbResult.length > 0 && hasWindowIntegrityIssues(cleanedDbResult, interval);

    if (cleanedDbResult.length >= requestLimit && !dbWindowNeedsRemoteRepair) {
      const syncState = await db.getKlineSyncState(exchange, symbol, interval).catch(() => null);
      // DB 命中时异步回写 Redis，避免 TTL 过期后每次都穿透到 DB
      if (before === undefined) {
        void redisCache.setKlines(exchange, symbol, interval, cleanedDbResult).catch(() => {});
      }
      return {
        klines: cleanedDbResult.slice(-limit),
        source: 'cache',
        hasMore: syncState?.has_more_history ?? true,
      };
    }

    // 3. DB 查询不足或为空时，回退到 Remote 查询
    const remoteResult = await this.queryKlinesFromRemote(exchange, symbol, interval, requestLimit, before);

    if (remoteResult) {
      const { klines: remoteKlines, hasMore } = remoteResult;
      const mergedKlines = sanitizeKlineWindow(
        normalizeKlines([...cleanedDbResult, ...remoteKlines]),
        interval,
      );

      // 异步持久化，不阻塞返回
      this.persistKlines(exchange, symbol, interval, remoteKlines, mergedKlines, hasMore).catch(() => {});

      return {
        klines: mergedKlines.slice(-limit),
        source: 'remote',
        hasMore,
      };
    }

    // 4. 兜底：返回 DB 查询结果（即使不足）
    if (cleanedDbResult.length > 0) {
      return {
        klines: cleanedDbResult.slice(-limit),
        source: 'cache',
        hasMore: false,
      };
    }

    return {
      klines: [],
      source: 'cache',
      hasMore: false,
    };
  }

  private async queryKlinesFromDb(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number,
    before?: number,
  ): Promise<Kline[] | null> {
    try {
      const klines = normalizeKlines(
        await db.getKlines(exchange, symbol, interval, limit, before) as Kline[],
      );
      return klines.length > 0 ? klines : null;
    } catch (error: any) {
      console.debug(`DB query failed for ${exchange}:${symbol}:${interval}: ${error.message}`);
      return null;
    }
  }

  private async queryKlinesFromRemote(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number,
    before?: number,
  ): Promise<{ klines: Kline[]; hasMore: boolean } | null> {
    try {
      const adapter = this.adapters.get(exchange);
      if (!adapter) {
        console.warn(`Missing exchange adapter: ${exchange}`);
        return null;
      }

      const remoteKlines = await this.fetchPagedRemoteKlines(adapter, symbol, interval, limit, before);
      return {
        klines: remoteKlines,
        hasMore: remoteKlines.length >= limit,
      };
    } catch (error: any) {
      console.error(`Remote query failed for ${exchange}:${symbol}:${interval}: ${error.message}`);
      return null;
    }
  }

  private async persistKlines(
    exchange: string,
    symbol: string,
    interval: string,
    newKlines: Kline[],
    allKlines: Kline[],
    hasMore: boolean,
  ): Promise<void> {
    if (newKlines.length === 0) return;

    try {
      await Promise.all([
        this.saveKlines(newKlines),
        redisCache.setKlines(exchange, symbol, interval, allKlines),
        syncStateService.recordHistorySyncSuccess(
          exchange,
          symbol,
          interval,
          allKlines,
          hasMore,
          'remote',
        ),
      ]);
    } catch (error: any) {
      console.warn(`Persist klines failed: ${error.message}`);
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
    const currentIntervalOpenTime = floorToInterval(Date.now(), interval);

    try {
      const klines = await db.getKlines(exchange, symbol, interval, 1) as Kline[];
      const latestCached = klines[0] ?? null;

      if (latestCached && latestCached.open_time >= currentIntervalOpenTime) {
        return latestCached;
      }

      const remoteResult = await this.queryKlinesFromRemote(exchange, symbol, interval, 2);
      const latestRemote = remoteResult?.klines[remoteResult.klines.length - 1] ?? null;

      if (latestRemote) {
        void this.saveKline(latestRemote).catch(() => {});
        return latestRemote;
      }

      return latestCached;
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

    const requestLimit = missingCount + 1;
    const dbWindow = await this.queryKlinesFromDb(
      exchange,
      symbol,
      interval,
      requestLimit,
      toExclusiveOpenTime,
    );
    const dbGapKlines = normalizeKlines(dbWindow ?? []).filter((kline) => (
      kline.open_time > fromExclusiveOpenTime &&
      kline.open_time < toExclusiveOpenTime
    ));

    if (dbGapKlines.length >= missingCount) {
      return dbGapKlines;
    }

    const remoteWindow = await this.queryKlinesFromRemote(
      exchange,
      symbol,
      interval,
      requestLimit,
      toExclusiveOpenTime,
    );
    const remoteGapKlines = normalizeKlines(remoteWindow?.klines ?? []).filter((kline) => (
      kline.open_time > fromExclusiveOpenTime &&
      kline.open_time < toExclusiveOpenTime
    ));

    return normalizeKlines([...dbGapKlines, ...remoteGapKlines]);
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

function sanitizeKlineWindow(klines: Kline[], interval: string): Kline[] {
  return normalizeKlines(klines).filter((kline, index, window) => {
    if (!isSyntheticGapPlaceholder(kline)) {
      return true;
    }

    const previous = window[index - 1];
    const next = window[index + 1];
    const intervalMs = getIntervalMs(interval);
    const expectedPreviousOpenTime = kline.open_time - intervalMs;
    const expectedNextOpenTime = kline.open_time + intervalMs;

    if (!previous || !next) {
      return false;
    }

    return !(
      previous.open_time === expectedPreviousOpenTime &&
      next.open_time === expectedNextOpenTime
    );
  });
}

function hasWindowIntegrityIssues(klines: Kline[], interval: string): boolean {
  const normalized = normalizeKlines(klines);
  const intervalMs = getIntervalMs(interval);

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];

    if (current && isSyntheticGapPlaceholder(current)) {
      return true;
    }

    if (previous && current && current.open_time - previous.open_time > intervalMs) {
      return true;
    }
  }

  return false;
}

function isSyntheticGapPlaceholder(kline: Kline): boolean {
  return (
    kline.is_closed === 1 &&
    kline.volume === 0 &&
    kline.quote_volume === 0 &&
    (kline.trades_count ?? 0) === 0 &&
    kline.open === kline.high &&
    kline.open === kline.low &&
    kline.open === kline.close
  );
}

function getIntervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? DEFAULT_INTERVAL_MS;
}

function floorToInterval(timestamp: number, interval: string): number {
  const intervalMs = getIntervalMs(interval);
  return Math.floor(timestamp / intervalMs) * intervalMs;
}
