import { redisCache } from '../cache/redis.js';
import { db } from '../database/postgres.js';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { ExchangeAdapter, Kline, KlineQueryResult } from '../types/index.js';
import { syncStateService } from './sync-state.service.js';

const DEFAULT_INITIAL_KLINE_LIMIT = 500;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const QUERY_CACHE_TTL = 5 * 60 * 1000; // 5 分钟 - 历史数据缓存
const QUERY_CACHE_TTL_LATEST = 30 * 1000; // 30 秒 - 最新数据缓存（快速过期以获取实时价格）

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

// LRU 查询缓存：按 (exchange, symbol, interval) 预取整小时数据块
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}
function createCacheKey(exchange: string, symbol: string, interval: string, limit: number, before?: number): string {
  return `${exchange}:${symbol}:${interval}:${limit}:${before ?? 'latest'}`;
}

// SingleFlight 机制：并发查询去重
interface FlightEntry<T> {
  promise: Promise<T>;
  timestamp: number;
}

export class KlineService {
  private adapters: Map<string, ExchangeAdapter>;
  private queryCache = new Map<string, CacheEntry<Kline[]>>();
  private singleFlights = new Map<string, FlightEntry<KlineQueryResult>>();
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(adapters?: Map<string, ExchangeAdapter>) {
    this.adapters = adapters ?? new Map<string, ExchangeAdapter>([
      ['binance', new BinanceAdapter()],
      ['okx', new OKXAdapter()],
    ]);
    this.startCacheCleanup();
  }

  private startCacheCleanup(): void {
    // 每 10 秒清理一次过期缓存和 SingleFlight
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      // 清理过期的查询缓存
      for (const [key, entry] of this.queryCache.entries()) {
        // 历史数据缓存 TTL 5 分钟，最新数据缓存 TTL 30 秒
        const isLatestData = !key.includes(':before:');
        const ttl = isLatestData ? QUERY_CACHE_TTL_LATEST : QUERY_CACHE_TTL;
        if (now - entry.timestamp >= ttl) {
          this.queryCache.delete(key);
        }
      }
      // 清理过期的 SingleFlight（超过 60 秒未完成或已完成的查询）
      for (const [key, entry] of this.singleFlights.entries()) {
        if (now - entry.timestamp >= 60000) {
          this.singleFlights.delete(key);
        }
      }
    }, 10000);

    // 进程退出时清理定时器
    process.on('SIGINT', () => this.stopCacheCleanup());
    process.on('SIGTERM', () => this.stopCacheCleanup());
  }

  private stopCacheCleanup(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = DEFAULT_INITIAL_KLINE_LIMIT,
    before?: number,
  ): Promise<KlineQueryResult> {
    const cacheKey = createCacheKey(exchange, symbol, interval, limit, before);

    // SingleFlight: 检查是否有相同的查询正在进行
    const existingFlight = this.singleFlights.get(cacheKey);
    if (existingFlight && Date.now() - existingFlight.timestamp < 60000) {
      // 返回相同的 Promise，避免重复查询
      return existingFlight.promise;
    }

    // 包装查询为 SingleFlight
    const queryPromise = this.performKlineQuery(exchange, symbol, interval, limit, before, cacheKey);
    const wrappedPromise = queryPromise.finally(() => {
      // 查询完成后清理 SingleFlight
      if (this.singleFlights.get(cacheKey)?.promise === queryPromise) {
        this.singleFlights.delete(cacheKey);
      }
    });

    // 记录 SingleFlight
    this.singleFlights.set(cacheKey, {
      promise: wrappedPromise,
      timestamp: Date.now(),
    });

    return wrappedPromise;
  }

  private async performKlineQuery(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number,
    before: number | undefined,
    cacheKey: string,
  ): Promise<KlineQueryResult> {
    const requestLimit = limit + 1;

    // 检查内存缓存
    // before 参数时使用较长 TTL（历史数据不变），无 before 时使用较短 TTL（获取最新价格）
    const cacheTTL = before !== undefined ? QUERY_CACHE_TTL : QUERY_CACHE_TTL_LATEST;

    if (before !== undefined) {
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheTTL) {
        return {
          klines: cached.data.slice(-limit),
          source: 'cache',
          hasMore: true,
        };
      }
    }

    // 1. 无 before 参数时，先查 Redis（最新数据缓存）
    if (before === undefined) {
      const redisKlines = await redisCache.getKlines(exchange, symbol, interval, requestLimit);
      if (redisKlines && redisKlines.length >= requestLimit) {
        const sanitizedKlines = sanitizeKlineWindow(redisKlines, interval);
        void redisCache.setKlines(exchange, symbol, interval, sanitizedKlines).catch(() => {});
        return {
          klines: sanitizedKlines.slice(-limit),
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
      // DB 命中时异步回写 Redis，避免 TTL 过期后每次都穿透到 DB
      if (before === undefined) {
        void redisCache.setKlines(exchange, symbol, interval, cleanedDbResult).catch(() => {});
      } else {
        // 历史数据查询结果存入内存缓存（5 分钟 TTL）
        this.queryCache.set(cacheKey, { data: cleanedDbResult, timestamp: Date.now(), key: cacheKey });
      }
      return {
        klines: cleanedDbResult.slice(-limit),
        source: 'cache',
        hasMore: true,
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

      // 历史数据查询结果存入内存缓存（5 分钟 TTL）
      if (before !== undefined) {
        this.queryCache.set(cacheKey, { data: mergedKlines, timestamp: Date.now(), key: cacheKey });
      }

      return {
        klines: mergedKlines.slice(-limit),
        source: 'remote',
        hasMore,
      };
    }

    // 4. 兜底：返回 DB 查询结果（即使不足）
    if (cleanedDbResult.length > 0) {
      if (before !== undefined) {
        this.queryCache.set(cacheKey, { data: cleanedDbResult, timestamp: Date.now(), key: cacheKey });
      }
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
      const filteredKlines = typeof before === 'number'
        ? klines.filter((kline) => kline.open_time < before)
        : klines;
      return filteredKlines.length > 0 ? filteredKlines : null;
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
      const filteredKlines = typeof before === 'number'
        ? remoteKlines.filter((kline) => kline.open_time < before)
        : remoteKlines;
      return {
        klines: filteredKlines,
        hasMore: filteredKlines.length >= limit,
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
      const latestCachedIsCurrentBucket = Boolean(
        latestCached && latestCached.open_time >= currentIntervalOpenTime,
      );
      const latestCachedNeedsRefresh = Boolean(
        latestCachedIsCurrentBucket &&
        latestCached?.is_closed === 1
      );

      if (latestCachedIsCurrentBucket && !latestCachedNeedsRefresh) {
        return latestCached;
      }

      const latestRemote = await this.fetchLatestRemoteKline(exchange, symbol, interval);

      if (latestRemote) {
        void this.saveKline(latestRemote).catch(() => {});
        return latestRemote;
      }

      return latestCached;
    } catch (error: any) {
      console.warn(`DB unavailable for latest cached kline ${exchange}:${symbol}:${interval}: ${error.message}`);
      return this.fetchLatestRemoteKline(exchange, symbol, interval);
    }
  }

  private async fetchLatestRemoteKline(
    exchange: string,
    symbol: string,
    interval: string,
  ): Promise<Kline | null> {
    const remoteResult = await this.queryKlinesFromRemote(exchange, symbol, interval, 2);
    const latestRemote = remoteResult?.klines[remoteResult.klines.length - 1] ?? null;

    if (latestRemote) {
      void this.saveKline(latestRemote).catch(() => {});
    }

    return latestRemote;
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
    let accumulatedKlines: Kline[] = [];
    let cursor = before;
    let previousCursor: number | undefined;

    while (countUsableKlines(accumulatedKlines, before) < limit) {
      const remaining = limit - countUsableKlines(accumulatedKlines, before);
      const page = normalizeKlines(
        await adapter.getKlines(symbol, interval, remaining, cursor),
      );

      if (page.length === 0) {
        break;
      }

      accumulatedKlines = normalizeKlines([...page, ...accumulatedKlines]);

      if (countUsableKlines(accumulatedKlines, before) >= limit) {
        break;
      }

      const oldestOpenTime = page[0]?.open_time;
      if (
        typeof oldestOpenTime !== 'number' ||
        oldestOpenTime === previousCursor ||
        (typeof cursor === 'number' && oldestOpenTime >= cursor)
      ) {
        break;
      }

      previousCursor = cursor;
      cursor = oldestOpenTime - 1;
    }

    return accumulatedKlines;
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

function countUsableKlines(klines: Kline[], before?: number): number {
  if (typeof before !== 'number') {
    return klines.length;
  }

  return klines.filter((kline) => kline.open_time < before).length;
}
