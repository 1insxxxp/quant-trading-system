import { db } from '../database/postgres.js';
import type { Kline } from '../types/index.js';

const MAX_ERROR_MESSAGE_LENGTH = 500;

export class SyncStateService {
  async recordSymbolSyncSuccess(exchange: string, type: string, symbolCount: number): Promise<void> {
    await db.upsertSymbolSyncState({
      exchange,
      type,
      status: 'idle',
      symbol_count: symbolCount,
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
  }

  async recordSymbolSyncError(exchange: string, type: string, error: unknown): Promise<void> {
    await db.upsertSymbolSyncState({
      exchange,
      type,
      status: 'error',
      last_error: formatSyncError(error),
    });
  }

  async recordHistorySyncSuccess(
    exchange: string,
    symbol: string,
    interval: string,
    klines: Kline[],
    hasMoreHistory: boolean,
    source: string,
  ): Promise<void> {
    const current = await db.getKlineSyncState(exchange, symbol, interval);
    const openTimes = klines.map((kline) => kline.open_time);
    const earliestOpenTime = openTimes.length > 0
      ? Math.min(current?.earliest_open_time ?? Number.POSITIVE_INFINITY, ...openTimes)
      : current?.earliest_open_time;
    const latestOpenTime = openTimes.length > 0
      ? Math.max(current?.latest_open_time ?? Number.NEGATIVE_INFINITY, ...openTimes)
      : current?.latest_open_time;

    await db.upsertKlineSyncState({
      exchange,
      symbol,
      interval,
      earliest_open_time: Number.isFinite(earliestOpenTime) ? earliestOpenTime : null,
      latest_open_time: Number.isFinite(latestOpenTime) ? latestOpenTime : null,
      has_more_history: hasMoreHistory,
      last_history_sync_at: new Date().toISOString(),
      last_history_error: null,
      source,
    });
  }

  async recordHistorySyncError(
    exchange: string,
    symbol: string,
    interval: string,
    error: unknown,
  ): Promise<void> {
    await db.upsertKlineSyncState({
      exchange,
      symbol,
      interval,
      last_history_error: formatSyncError(error),
    });
  }

  async recordRealtimeSyncSuccess(kline: Kline): Promise<void> {
    const current = await db.getKlineSyncState(kline.exchange, kline.symbol, kline.interval);
    const earliestOpenTime = current?.earliest_open_time ?? kline.open_time;
    const latestOpenTime = current?.latest_open_time == null
      ? kline.open_time
      : Math.max(current.latest_open_time, kline.open_time);

    await db.upsertKlineSyncState({
      exchange: kline.exchange,
      symbol: kline.symbol,
      interval: kline.interval,
      earliest_open_time: earliestOpenTime,
      latest_open_time: latestOpenTime,
      last_realtime_sync_at: new Date().toISOString(),
      last_realtime_error: null,
      source: kline.exchange,
    });
  }

  async recordRealtimeSyncError(kline: Kline, error: unknown): Promise<void> {
    await db.upsertKlineSyncState({
      exchange: kline.exchange,
      symbol: kline.symbol,
      interval: kline.interval,
      last_realtime_error: formatSyncError(error),
    });
  }
}

export const syncStateService = new SyncStateService();

function formatSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}
