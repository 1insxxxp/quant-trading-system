import { db } from '../database/postgres.js';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { ExchangeAdapter, Kline, KlineQueryResult } from '../types/index.js';
import { syncStateService } from './sync-state.service.js';

const DEFAULT_INITIAL_KLINE_LIMIT = 2000;

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
    const syncState = await db.getKlineSyncState(exchange, symbol, interval);
    const cached = normalizeKlines(
      await db.getKlines(exchange, symbol, interval, requestLimit, before) as Kline[],
    );

    if (cached.length >= requestLimit) {
      return {
        klines: cached.slice(-limit),
        source: 'cache',
        hasMore: true,
      };
    }

    console.log(`Cache miss for ${exchange}:${symbol}:${interval} (${cached.length}/${limit})`);

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
      const hasMore = mergedKlines.length > limit;
      const responseKlines = mergedKlines.slice(-limit);

      if (remoteKlines.length > 0) {
        await this.saveKlines(remoteKlines);
        await syncStateService.recordHistorySyncSuccess(
          exchange,
          symbol,
          interval,
          mergedKlines,
          hasMore,
          exchange,
        );
        return {
          klines: responseKlines,
          source: responseKlines.length === cached.length ? 'cache' : 'remote',
          hasMore,
        };
      }

      await syncStateService.recordHistorySyncSuccess(
        exchange,
        symbol,
        interval,
        cached,
        false,
        exchange,
      );
      return this.buildFallbackResult(cached, limit, false);
    } catch (error: any) {
      console.error('Failed to load remote klines:', error.message);
      await syncStateService.recordHistorySyncError(exchange, symbol, interval, error);
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
    const klines = await db.getKlines(exchange, symbol, interval, 1) as Kline[];
    return klines[0] ?? null;
  }

  getExchanges(): string[] {
    return ['binance', 'okx'];
  }

  async getSymbols(exchange?: string, type?: string): Promise<any[]> {
    return db.getSymbols(exchange, type);
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
    const collected = new Map<number, Kline>();
    let cursor = before;
    let remaining = limit;

    while (remaining > 0) {
      const page = normalizeKlines(
        await adapter.getKlines(symbol, interval, remaining, cursor),
      );

      if (page.length === 0) {
        break;
      }

      page.forEach((kline) => {
        collected.set(kline.open_time, kline);
      });

      remaining = limit - collected.size;

      const earliest = page[0];

      if (!earliest || page.length === 1 && cursor === earliest.open_time) {
        break;
      }

      cursor = earliest.open_time;

      if (page.length === 1) {
        break;
      }
    }

    return normalizeKlines([...collected.values()]).slice(-limit);
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
