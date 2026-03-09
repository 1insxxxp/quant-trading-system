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
});
