import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './postgres.js';

function createMockPool() {
  return {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSymbol() {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    base_asset: 'BTC',
    quote_asset: 'USDT',
    type: 'spot',
    status: 'active',
  };
}

function makeKline() {
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
  };
}

function makeKlineSyncStateRow() {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1h',
    earliest_open_time: 1000,
    latest_open_time: 4000,
    has_more_history: true,
    last_history_sync_at: '2026-03-09T12:00:00.000Z',
    last_realtime_sync_at: '2026-03-09T12:05:00.000Z',
    last_history_error: null,
    last_realtime_error: null,
    source: 'binance',
    created_at: '2026-03-09T12:00:00.000Z',
    updated_at: '2026-03-09T12:05:00.000Z',
  };
}

function makeSymbolSyncStateRow() {
  return {
    exchange: 'binance',
    type: 'spot',
    status: 'idle',
    symbol_count: 2,
    last_sync_at: '2026-03-09T12:00:00.000Z',
    last_error: null,
    created_at: '2026-03-09T12:00:00.000Z',
    updated_at: '2026-03-09T12:05:00.000Z',
  };
}

describe('DatabaseService', () => {
  it('waits for schema initialization before running read queries', async () => {
    const pool = createMockPool();
    let releaseInit: ((value: unknown) => void) | null = null;
    const initGate = new Promise((resolve) => {
      releaseInit = resolve;
    });

    pool.query
      .mockImplementationOnce(() => initGate)
      .mockResolvedValue({ rows: [] });

    const service = new DatabaseService(pool as never);
    const pending = service.getSymbols('binance', 'spot');

    await Promise.resolve();

    expect(pool.query).toHaveBeenCalledTimes(1);

    releaseInit?.({ rows: [] });
    await pending;

    expect(pool.query.mock.calls.at(-1)?.[0]).toContain('SELECT * FROM symbols');
  });

  it('creates symbols.updated_at and overwrites kline totals on conflict', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });

    const service = new DatabaseService(pool as never);
    await service.ready();

    const schemaQuery = pool.query.mock.calls
      .map((call) => String(call[0]))
      .find((query) => query.includes('CREATE TABLE IF NOT EXISTS symbols'));

    expect(schemaQuery).toContain('updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');

    await service.saveSymbol(makeSymbol());
    const symbolQuery = String(pool.query.mock.calls.at(-1)?.[0]);

    expect(symbolQuery).toContain('updated_at = CURRENT_TIMESTAMP');

    await service.saveKline(makeKline());
    const klineQuery = String(pool.query.mock.calls.at(-1)?.[0]);

    expect(klineQuery).toContain('volume = EXCLUDED.volume');
    expect(klineQuery).toContain('quote_volume = EXCLUDED.quote_volume');
    expect(klineQuery).toContain('trades_count = EXCLUDED.trades_count');
    expect(klineQuery).not.toContain('volume = klines.volume + EXCLUDED.volume');
  });

  it('creates sync-state tables and can upsert/read sync-state rows', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });

    const service = new DatabaseService(pool as never);
    await service.ready();

    const queries = pool.query.mock.calls.map((call) => String(call[0]));

    expect(queries.some((query) => query.includes('CREATE TABLE IF NOT EXISTS kline_sync_state'))).toBe(true);
    expect(queries.some((query) => query.includes('CREATE TABLE IF NOT EXISTS symbol_sync_state'))).toBe(true);

    await service.upsertKlineSyncState({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 1000,
      latest_open_time: 4000,
      has_more_history: true,
      source: 'binance',
    });
    const klineSyncUpsertQuery = String(pool.query.mock.calls.at(-1)?.[0]);
    expect(klineSyncUpsertQuery).toContain('INSERT INTO kline_sync_state');

    pool.query.mockResolvedValueOnce({ rows: [makeKlineSyncStateRow()] });
    const klineSyncState = await service.getKlineSyncState('binance', 'BTCUSDT', '1h');
    expect(klineSyncState).toEqual(makeKlineSyncStateRow());

    await service.upsertSymbolSyncState({
      exchange: 'binance',
      type: 'spot',
      status: 'idle',
      symbol_count: 2,
    });
    const symbolSyncUpsertQuery = String(pool.query.mock.calls.at(-1)?.[0]);
    expect(symbolSyncUpsertQuery).toContain('INSERT INTO symbol_sync_state');

    pool.query.mockResolvedValueOnce({ rows: [makeSymbolSyncStateRow()] });
    const symbolSyncState = await service.getSymbolSyncState('binance', 'spot');
    expect(symbolSyncState).toEqual(makeSymbolSyncStateRow());
  });

  it('backfills kline and symbol sync-state rows from existing data', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });

    const service = new DatabaseService(pool as never);
    await service.ready();
    pool.query.mockClear();

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            exchange: 'binance',
            symbol: 'BTCUSDT',
            interval: '1h',
            earliest_open_time: 1000,
            latest_open_time: 4000,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const klineBackfillCount = await service.backfillKlineSyncState();

    expect(klineBackfillCount).toBe(1);
    expect(String(pool.query.mock.calls[0]?.[0])).toContain('FROM klines');
    expect(String(pool.query.mock.calls.at(-1)?.[0])).toContain('INSERT INTO kline_sync_state');
    expect(pool.query.mock.calls.at(-1)?.[1]).toEqual([
      'binance',
      'BTCUSDT',
      '1h',
      1000,
      4000,
      true,
      null,
      null,
      null,
      null,
      'binance',
    ]);

    pool.query.mockClear();
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            exchange: 'binance',
            type: 'spot',
            symbol_count: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const symbolBackfillCount = await service.backfillSymbolSyncState();

    expect(symbolBackfillCount).toBe(1);
    expect(String(pool.query.mock.calls[0]?.[0])).toContain('FROM symbols');
    expect(String(pool.query.mock.calls.at(-1)?.[0])).toContain('INSERT INTO symbol_sync_state');
    expect(pool.query.mock.calls.at(-1)?.[1]).toEqual([
      'binance',
      'spot',
      'idle',
      2,
      null,
      null,
    ]);
  });

  it('allows explicit nulls to clear sync-state error fields', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });

    const service = new DatabaseService(pool as never);
    await service.ready();
    pool.query.mockClear();

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          ...makeKlineSyncStateRow(),
          last_history_error: 'stale history error',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await service.upsertKlineSyncState({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      last_history_error: null,
    });

    expect(pool.query.mock.calls.at(-1)?.[1]).toContain(null);

    pool.query.mockClear();
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          ...makeSymbolSyncStateRow(),
          last_error: 'old symbol error',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await service.upsertSymbolSyncState({
      exchange: 'binance',
      type: 'spot',
      last_error: null,
    });

    expect(pool.query.mock.calls.at(-1)?.[1]).toContain(null);
  });
});
