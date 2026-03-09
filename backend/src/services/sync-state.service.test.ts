import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    getKlineSyncState: vi.fn(),
    upsertKlineSyncState: vi.fn(),
    upsertSymbolSyncState: vi.fn(),
  },
}));

vi.mock('../database/postgres.js', () => ({
  db: mockDb,
}));

import type { Kline } from '../types/index.js';
import { SyncStateService } from './sync-state.service.js';

function makeKline(overrides: Partial<Kline> = {}): Kline {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1h',
    open_time: 1000,
    close_time: 1999,
    open: 100,
    high: 120,
    low: 90,
    close: 110,
    volume: 10,
    quote_volume: 1100,
    trades_count: 3,
    is_closed: 1,
    ...overrides,
  };
}

describe('SyncStateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getKlineSyncState.mockResolvedValue(null);
    mockDb.upsertKlineSyncState.mockResolvedValue(undefined);
    mockDb.upsertSymbolSyncState.mockResolvedValue(undefined);
  });

  it('records symbol sync success with count and cleared error', async () => {
    const service = new SyncStateService();

    await service.recordSymbolSyncSuccess('binance', 'spot', 2);

    expect(mockDb.upsertSymbolSyncState).toHaveBeenCalledWith(expect.objectContaining({
      exchange: 'binance',
      type: 'spot',
      status: 'idle',
      symbol_count: 2,
      last_error: null,
      last_sync_at: expect.any(String),
    }));
  });

  it('records symbol sync errors without dropping existing counts', async () => {
    const service = new SyncStateService();

    await service.recordSymbolSyncError('okx', 'spot', new Error('upstream timeout'));

    expect(mockDb.upsertSymbolSyncState).toHaveBeenCalledWith({
      exchange: 'okx',
      type: 'spot',
      status: 'error',
      last_error: 'upstream timeout',
    });
  });

  it('records history sync success with merged earliest/latest state', async () => {
    mockDb.getKlineSyncState.mockResolvedValue({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 500,
      latest_open_time: 1500,
      has_more_history: true,
      last_history_sync_at: null,
      last_realtime_sync_at: null,
      last_history_error: 'old error',
      last_realtime_error: null,
      source: 'binance',
      created_at: '2026-03-09T12:00:00.000Z',
      updated_at: '2026-03-09T12:00:00.000Z',
    });

    const service = new SyncStateService();

    await service.recordHistorySyncSuccess(
      'binance',
      'BTCUSDT',
      '1h',
      [makeKline({ open_time: 1000 }), makeKline({ open_time: 4000 })],
      true,
      'binance',
    );

    expect(mockDb.upsertKlineSyncState).toHaveBeenCalledWith(expect.objectContaining({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 500,
      latest_open_time: 4000,
      has_more_history: true,
      last_history_error: null,
      last_history_sync_at: expect.any(String),
      source: 'binance',
    }));
  });

  it('records history sync errors', async () => {
    const service = new SyncStateService();

    await service.recordHistorySyncError('binance', 'BTCUSDT', '1h', new Error('remote failure'));

    expect(mockDb.upsertKlineSyncState).toHaveBeenCalledWith({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      last_history_error: 'remote failure',
    });
  });

  it('records realtime sync success with latest candle and cleared error', async () => {
    mockDb.getKlineSyncState.mockResolvedValue({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 1000,
      latest_open_time: 3000,
      has_more_history: true,
      last_history_sync_at: null,
      last_realtime_sync_at: null,
      last_history_error: null,
      last_realtime_error: 'socket down',
      source: 'binance',
      created_at: '2026-03-09T12:00:00.000Z',
      updated_at: '2026-03-09T12:00:00.000Z',
    });

    const service = new SyncStateService();
    const kline = makeKline({ open_time: 4000, is_closed: 0 });

    await service.recordRealtimeSyncSuccess(kline);

    expect(mockDb.upsertKlineSyncState).toHaveBeenCalledWith(expect.objectContaining({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 1000,
      latest_open_time: 4000,
      last_realtime_error: null,
      last_realtime_sync_at: expect.any(String),
      source: 'binance',
    }));
  });

  it('records realtime sync errors', async () => {
    const service = new SyncStateService();

    await service.recordRealtimeSyncError(makeKline(), new Error('write failed'));

    expect(mockDb.upsertKlineSyncState).toHaveBeenCalledWith({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      last_realtime_error: 'write failed',
    });
  });
});
