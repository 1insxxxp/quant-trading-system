import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, binanceAdapterMock, okxAdapterMock } = vi.hoisted(() => ({
  mockDb: {
    getKlines: vi.fn(),
    saveKline: vi.fn(),
    saveKlines: vi.fn(),
    getSymbols: vi.fn(),
  },
  binanceAdapterMock: {
    getKlines: vi.fn(),
  },
  okxAdapterMock: {
    getKlines: vi.fn(),
  },
}));

vi.mock('../database/sqlite.js', () => ({
  db: mockDb,
}));

vi.mock('../database/postgres.js', () => ({
  db: mockDb,
}));

vi.mock('../exchanges/binance.js', () => ({
  BinanceAdapter: vi.fn(() => binanceAdapterMock),
}));

vi.mock('../exchanges/okx.js', () => ({
  OKXAdapter: vi.fn(() => okxAdapterMock),
}));

import { KlineService } from './kline.service.js';

function makeKline(openTime: number, exchange = 'binance') {
  return {
    exchange,
    symbol: 'BTCUSDT',
    interval: '1h',
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

describe('KlineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.saveKline.mockResolvedValue(undefined);
    mockDb.saveKlines.mockResolvedValue(undefined);
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
  });

  it('loops upstream history requests until the requested bar count is satisfied', async () => {
    mockDb.getKlines.mockResolvedValue([]);
    binanceAdapterMock.getKlines
      .mockResolvedValueOnce([makeKline(3000), makeKline(4000)])
      .mockResolvedValueOnce([makeKline(1000), makeKline(2000)])
      .mockResolvedValueOnce([]);

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 4);

    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(1, 'BTCUSDT', '1h', 5, undefined);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', '1h', 3, 3000);
    expect(binanceAdapterMock.getKlines).toHaveBeenNthCalledWith(3, 'BTCUSDT', '1h', 1, 1000);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000, 3000, 4000]);
    expect(result.hasMore).toBe(false);
  });

  it('returns only bars strictly earlier than the before cursor', async () => {
    mockDb.getKlines.mockResolvedValue([makeKline(1000), makeKline(2000)]);
    binanceAdapterMock.getKlines.mockRejectedValue(new Error('timeout'));

    const service = new KlineService();

    const result = await service.getKlines('binance', 'BTCUSDT', '1h', 2, 3000);

    expect(mockDb.getKlines).toHaveBeenCalledWith('binance', 'BTCUSDT', '1h', 3, 3000);
    expect(result.klines.map((item) => item.open_time)).toEqual([1000, 2000]);
    expect(binanceAdapterMock.getKlines).toHaveBeenCalledWith('BTCUSDT', '1h', 3, 3000);
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
});
