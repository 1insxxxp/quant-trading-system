import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, redisCacheMock, binanceAdapterMock, okxAdapterMock, syncStateMock } = vi.hoisted(() => ({
  mockDb: {
    getKlines: vi.fn(),
    getKlineSyncState: vi.fn(),
    saveKline: vi.fn(),
    saveKlines: vi.fn(),
    getSymbols: vi.fn(),
  },
  redisCacheMock: {
    getKlines: vi.fn(),
    setKlines: vi.fn(),
  },
  binanceAdapterMock: {
    getKlines: vi.fn(),
    getSymbols: vi.fn(),
  },
  okxAdapterMock: {
    getKlines: vi.fn(),
    getSymbols: vi.fn(),
  },
  syncStateMock: {
    recordHistorySyncSuccess: vi.fn(),
    recordHistorySyncError: vi.fn(),
  },
}));

vi.mock('../database/sqlite.js', () => ({
  db: mockDb,
}));

vi.mock('../database/postgres.js', () => ({
  db: mockDb,
}));

vi.mock('../cache/redis.js', () => ({
  redisCache: redisCacheMock,
}));

vi.mock('../exchanges/binance.js', () => ({
  BinanceAdapter: vi.fn(() => binanceAdapterMock),
}));

vi.mock('../exchanges/okx.js', () => ({
  OKXAdapter: vi.fn(() => okxAdapterMock),
}));

vi.mock('./sync-state.service.js', () => ({
  syncStateService: syncStateMock,
}));

import { KlineService } from './kline.service.js';

function makeKline(openTime: number, exchange = 'binance', interval = '1h') {
  return {
    exchange,
    symbol: 'BTCUSDT',
    interval,
    open_time: openTime,
    close_time: openTime + 1,
    open: 100,
    high: 120,
    low: 90,
    close: 110,
    volume: 10,
    quote_volume: 1100,
    is_closed: 1,
  };
}

function makeFlatGapKline(openTime: number, price: number, exchange = 'binance', interval = '1h') {
  return {
    ...makeKline(openTime, exchange, interval),
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0,
    quote_volume: 0,
    trades_count: 0,
    is_closed: 1,
  };
}

describe('KlineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getKlines.mockReset();
    mockDb.getKlineSyncState.mockReset();
    mockDb.saveKline.mockReset();
    mockDb.saveKlines.mockReset();
    mockDb.getSymbols.mockReset();
    redisCacheMock.getKlines.mockReset();
    redisCacheMock.setKlines.mockReset();
    binanceAdapterMock.getKlines.mockReset();
    binanceAdapterMock.getSymbols.mockReset();
    okxAdapterMock.getKlines.mockReset();
    okxAdapterMock.getSymbols.mockReset();
    syncStateMock.recordHistorySyncSuccess.mockReset();
    syncStateMock.recordHistorySyncError.mockReset();
    redisCacheMock.getKlines.mockResolvedValue(null);
    redisCacheMock.setKlines.mockResolvedValue(undefined);
    mockDb.getKlineSyncState.mockResolvedValue(null);
    mockDb.saveKline.mockResolvedValue(undefined);
    mockDb.saveKlines.mockResolvedValue(undefined);
    binanceAdapterMock.getSymbols.mockResolvedValue([]);
    okxAdapterMock.getSymbols.mockResolvedValue([]);
  });

  it('fetches and persists klines when the requested market is missing from cache', async () => {
    const remoteKlines = [
      {
        exchange: 'okx',
        symbol: 'ETHUSDT',
        interval: '5m',
        open_time: 1,
        close_time: 2,
        open: 100,
        high: 120,
        low: 90,
        close: 110,
        volume: 10,
        quote_volume: 1100,
        is_closed: 1,
      },
    ];

    mockDb.getKlines.mockResolvedValue([]);
    okxAdapterMock.getKlines.mockResolvedValue(remoteKlines);

    const service = new KlineService();

    const result = await service.getKlines('okx', 'ETHUSDT', '5m', 100);

    expect(okxAdapterMock.getKlines).toHaveBeenCalledWith('ETHUSDT', '5m', 101, undefined);
    expect(mockDb.saveKlines).toHaveBeenCalledWith(remoteKlines);
    expect(syncStateMock.recordHistorySyncSuccess).toHaveBeenCalledWith(
      'okx',
      'ETHUSDT',
      '5m',
      remoteKlines,
      false,
      'remote',
    );
    expect(result).toEqual({
      klines: remoteKlines,
      source: 'remote',
      hasMore: false,
    });
  });

  it('returns an empty result when cache is empty and the upstream exchange request fails', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines.mockRejectedValue(new Error('timeout'));

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 12);

    expect(result.source).toBe('cache');
    expect(result.klines).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(mockDb.saveKlines).not.toHaveBeenCalled();
    expect(syncStateMock.recordHistorySyncError).not.toHaveBeenCalled();
  });

  it('loops upstream history requests until the requested bar count is satisfied', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines
      .mockResolvedValueOnce([makeKline(3000), makeKline(4000)])
      .mockResolvedValueOnce([makeKline(1000), makeKline(2000)])
      .mockResolvedValueOnce([]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 4);

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledTimes(3);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(1, 'BTCUSDT', '1h', 5, undefined);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', '1h', 3, 2999);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(3, 'BTCUSDT', '1h', 1, 999);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000, 3000, 4000]);
    expect(result.hasMore).toBe(false);
  });

  it('keeps hasMore enabled when capped upstream pages still have older history', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines
      .mockResolvedValueOnce([makeKline(5000), makeKline(6000)])
      .mockResolvedValueOnce([makeKline(3000), makeKline(4000)])
      .mockResolvedValueOnce([makeKline(1000), makeKline(2000)]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 4);

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledTimes(3);
    expect(result.klines.map((item) => item.open_time)).toEqual([3000, 4000, 5000, 6000]);
    expect(result.hasMore).toBe(true);
  });

  it('returns only bars strictly earlier than the before cursor', async () => {
    mockDb.getKlines.mockResolvedValue([makeKline(1000), makeKline(2000), makeKline(3000)]);
    binanceAdapterMock.getKlines.mockRejectedValue(new Error('timeout'));

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2, 3000);

    expect(mockDb.getKlines).toHaveBeenCalledWith('binance', 'BTCUSDT', '1h', 3, 3000);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000]);
    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('BTCUSDT', '1h', 3, 3000);
    expect(result.hasMore).toBe(false);
  });

  it('requests remote older pages with an exclusive before cursor to avoid duplicate edge bars', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines
      .mockResolvedValueOnce([makeKline(3000), makeKline(4000)])
      .mockResolvedValueOnce([makeKline(1000), makeKline(2000)])
      .mockResolvedValueOnce([makeKline(0)]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 4);

    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', '1h', 3, 2999);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(3, 'BTCUSDT', '1h', 1, 999);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000, 3000, 4000]);
    expect(result.hasMore).toBe(true);
  });

  it('keeps hasMore enabled when the upstream page includes the before-cursor candle', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines
      .mockResolvedValueOnce([makeKline(1000), makeKline(2000), makeKline(3000)])
      .mockResolvedValueOnce([makeKline(0)])
      .mockResolvedValueOnce([]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2, 3000);

    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(1, 'BTCUSDT', '1h', 3, 3000);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', '1h', 1, 999);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000]);
    expect(result.hasMore).toBe(true);
  });

  it('revalidates cached pages that contain synthetic flat gap candles', async () => {
    mockDb.getKlines.mockResolvedValue([
      makeFlatGapKline(120_000, 2134.2, 'binance', '15m'),
      makeFlatGapKline(180_000, 2134.2, 'binance', '15m'),
      makeKline(240_000, 'binance', '15m'),
    ]);
    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '15m'),
      makeKline(180_000, 'binance', '15m'),
      makeKline(240_000, 'binance', '15m'),
    ]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '15m', 2, 300_000);

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('BTCUSDT', '15m', 3, 300_000);
    expect(result.klines).toEqual([
      makeKline(180_000, 'binance', '15m'),
      makeKline(240_000, 'binance', '15m'),
    ]);
    expect(mockDb.saveKlines).toHaveBeenCalledWith([
      makeKline(120_000, 'binance', '15m'),
      makeKline(180_000, 'binance', '15m'),
      makeKline(240_000, 'binance', '15m'),
    ]);
  });

  it('clears persisted hasMore when upstream confirms there is no older history', async () => {
    mockDb.getKlineSyncState.mockResolvedValue({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 1000,
      latest_open_time: 2000,
      has_more_history: true,
    });
    mockDb.getKlines.mockResolvedValue([makeKline(1000), makeKline(2000)]);
    binanceAdapterMock.getKlines.mockResolvedValue([]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2, 3000);

    expect(syncStateMock.recordHistorySyncSuccess).not.toHaveBeenCalled();
    expect(result.hasMore).toBe(false);
  });

  it('marks hasMore when one extra historical bar exists beyond the requested page', async () => {
    mockDb.getKlines.mockResolvedValue([
      makeKline(1000),
      makeKline(2000),
      makeKline(3000),
    ]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2);

    expect(result.klines.map((item) => item.open_time)).toEqual([2000, 3000]);
    expect(result.hasMore).toBe(true);
  });

  it('keeps hasMore enabled when the database already returns an extra older bar even if sync state is stale', async () => {
    mockDb.getKlineSyncState.mockResolvedValue({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      earliest_open_time: 1000,
      latest_open_time: 3000,
      has_more_history: false,
    });
    mockDb.getKlines.mockResolvedValue([
      makeKline(1000),
      makeKline(2000),
      makeKline(3000),
    ]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2, 4000);

    expect(result.klines.map((item) => item.open_time)).toEqual([2000, 3000]);
    expect(result.hasMore).toBe(true);
  });

  it('hydrates the initial window with the latest live candle when the cached tail is stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(225_000));

    redisCacheMock.getKlines.mockResolvedValue(null);
    mockDb.getKlines
      .mockResolvedValueOnce([
        makeKline(120_000, 'binance', '1m'),
        makeKline(180_000, 'binance', '1m'),
      ])
      .mockResolvedValueOnce([
        {
          ...makeKline(180_000, 'binance', '1m'),
          close: 111,
          is_closed: 1,
        },
      ]);

    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '1m'),
      {
        ...makeKline(180_000, 'binance', '1m'),
        close: 125,
        is_closed: 0,
      },
    ]);

    const service = new KlineService();
    const result = await service.getKlines('binance', 'BTCUSDT', '1m', 1);

    expect(result.klines).toEqual([
      {
        ...makeKline(180_000, 'binance', '1m'),
        close: 125,
        is_closed: 0,
      },
    ]);
    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('BTCUSDT', '1m', 2, undefined);

    vi.useRealTimers();
  });

  it('loads the missing interval range before a realtime trade resumes after a gap', async () => {
    mockDb.getKlines.mockResolvedValue([
      makeKline(120_000),
      makeKline(180_000),
    ]);

    const service = new KlineService();

    const result = await service.recoverGapKlines(
      'binance',
      'BTCUSDT',
      '1m',
      60_000,
      240_000,
    );

    expect(mockDb.getKlines).toHaveBeenCalledWith('binance', 'BTCUSDT', '1m', 3, 240_000);
    expect(result.map((item) => item.open_time)).toEqual([120_000, 180_000]);
  });

  it('ignores misleading older db pages and recovers the explicit gap window from upstream', async () => {
    mockDb.getKlines.mockResolvedValue([
      makeKline(-180_000, 'binance', '1m'),
      makeKline(-120_000, 'binance', '1m'),
      makeKline(-60_000, 'binance', '1m'),
      makeKline(0, 'binance', '1m'),
      makeKline(60_000, 'binance', '1m'),
    ]);
    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(60_000, 'binance', '1m'),
      makeKline(120_000, 'binance', '1m'),
      makeKline(180_000, 'binance', '1m'),
      makeKline(240_000, 'binance', '1m'),
      makeKline(300_000, 'binance', '1m'),
    ]);

    const service = new KlineService();

    const result = await service.recoverGapKlines(
      'binance',
      'BTCUSDT',
      '1m',
      60_000,
      360_000,
    );

    expect(mockDb.getKlines).toHaveBeenCalledWith('binance', 'BTCUSDT', '1m', 5, 360_000);
    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('BTCUSDT', '1m', 5, 360_000);
    expect(result.map((item) => item.open_time)).toEqual([120_000, 180_000, 240_000, 300_000]);
  });

  it('falls back to exchange symbols when database is unavailable', async () => {
    mockDb.getSymbols.mockRejectedValue(new Error('db offline'));
    binanceAdapterMock.getSymbols.mockResolvedValue([
      {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        base_asset: 'BTC',
        quote_asset: 'USDT',
        type: 'spot',
        status: 'active',
      },
      {
        exchange: 'binance',
        symbol: 'ETHUSDT',
        base_asset: 'ETH',
        quote_asset: 'USDT',
        type: 'spot',
        status: 'active',
      },
    ]);

    const service = new KlineService();

    const symbols = await service.getSymbols('binance', 'spot');

    expect(binanceAdapterMock.getSymbols).toHaveBeenCalledTimes(1);
    expect(okxAdapterMock.getSymbols).not.toHaveBeenCalled();
    expect(symbols.map((item) => item.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('falls back to the upstream latest kline when database is unavailable', async () => {
    mockDb.getKlines.mockRejectedValue(new Error('db offline'));
    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '1h'),
      {
        ...makeKline(180_000, 'binance', '1h'),
        close: 125,
        is_closed: 0,
      },
    ]);

    const service = new KlineService();
    const result = await service.getLatestCachedKline('binance', 'ETHUSDT', '1h');

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('ETHUSDT', '1h', 2, undefined);
    expect(result).toEqual({
      ...makeKline(180_000, 'binance', '1h'),
      close: 125,
      is_closed: 0,
    });
  });

  it('refreshes the latest seed candle from upstream when the cached interval is stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(225_000));

    mockDb.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '1m'),
    ]);
    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '1m'),
      makeKline(180_000, 'binance', '1m'),
    ]);

    const service = new KlineService();
    const result = await service.getLatestCachedKline('binance', 'ETHUSDT', '1m');

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('ETHUSDT', '1m', 2, undefined);
    expect(result?.open_time).toBe(180_000);
    expect(mockDb.saveKline).toHaveBeenCalledWith(makeKline(180_000, 'binance', '1m'));

    vi.useRealTimers();
  });

  it('refreshes the latest seed candle from upstream when the cached current interval is incorrectly marked closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(225_000));

    mockDb.getKlines.mockResolvedValue([
      {
        ...makeKline(180_000, 'binance', '1m'),
        close: 111,
        is_closed: 1,
      },
    ]);
    binanceAdapterMock.getKlines.mockResolvedValue([
      makeKline(120_000, 'binance', '1m'),
      {
        ...makeKline(180_000, 'binance', '1m'),
        close: 125,
        is_closed: 0,
      },
    ]);

    const service = new KlineService();
    const result = await service.getLatestCachedKline('binance', 'ETHUSDT', '1m');

    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('ETHUSDT', '1m', 2, undefined);
    expect(result).toEqual({
      ...makeKline(180_000, 'binance', '1m'),
      close: 125,
      is_closed: 0,
    });

    vi.useRealTimers();
  });

  it('reuses the cached latest seed candle when it already belongs to the current interval bucket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(225_000));

    mockDb.getKlines.mockResolvedValue([
      {
        ...makeKline(180_000, 'binance', '1m'),
        is_closed: 0,
      },
    ]);

    const service = new KlineService();
    const result = await service.getLatestCachedKline('binance', 'ETHUSDT', '1m');

    expect(binanceAdapterMock.getKlines).not.toHaveBeenCalled();
    expect(result?.open_time).toBe(180_000);

    vi.useRealTimers();
  });
});
