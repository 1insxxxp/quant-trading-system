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

vi.mock('../exchanges/binance.js', () => ({
  BinanceAdapter: vi.fn(() => binanceAdapterMock),
}));

vi.mock('../exchanges/okx.js', () => ({
  OKXAdapter: vi.fn(() => okxAdapterMock),
}));

import { KlineService } from './kline.service.js';

describe('KlineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.saveKline.mockImplementation((_kline, callback) => {
      callback?.(null);
    });
    mockDb.saveKlines.mockImplementation((_klines, callback) => {
      callback?.(null);
    });
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

    expect(okxAdapterMock.getKlines).toHaveBeenCalledWith('ETHUSDT', '5m', 100);
    expect(mockDb.saveKlines).toHaveBeenCalledWith(remoteKlines, expect.any(Function));
    expect(result).toEqual(remoteKlines);
  });
});
