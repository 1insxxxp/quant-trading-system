import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketStore } from './marketStore';
import type { Kline } from '../types';

const initialState = useMarketStore.getState();

function makeKline(
  overrides: Partial<Kline> = {},
): Kline {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1h',
    open_time: 1,
    close_time: 2,
    open: 100,
    high: 120,
    low: 90,
    close: 110,
    volume: 10,
    quote_volume: 1100,
    is_closed: 1,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('marketStore', () => {
  beforeEach(() => {
    useMarketStore.setState(
      {
        ...initialState,
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: '1h',
        klines: [],
        latestPrice: null,
        isConnected: false,
      },
      true,
    );
    vi.restoreAllMocks();
  });

  it('clears stale chart data immediately when switching market selection', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)) as typeof fetch,
    );

    useMarketStore.setState({
      klines: [makeKline()],
      latestPrice: 99999,
    });

    useMarketStore.getState().setExchange('okx');

    expect(useMarketStore.getState().klines).toEqual([]);
    expect(useMarketStore.getState().latestPrice).toBeNull();
  });

  it('ignores stale fetch responses after the active market changes', async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => firstResponse.promise)
        .mockImplementationOnce(() => secondResponse.promise) as typeof fetch,
    );

    useMarketStore.setState({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
    });

    const firstFetch = useMarketStore.getState().fetchKlines();

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'ETHUSDT',
      interval: '5m',
    });

    const secondFetch = useMarketStore.getState().fetchKlines();

    secondResponse.resolve({
      json: async () => ({
        success: true,
        klines: [makeKline({ exchange: 'okx', symbol: 'ETHUSDT', interval: '5m', open_time: 10 })],
        count: 1,
      }),
    } as Response);
    await secondFetch;

    firstResponse.resolve({
      json: async () => ({
        success: true,
        klines: [makeKline({ exchange: 'binance', symbol: 'BTCUSDT', interval: '1h', open_time: 1 })],
        count: 1,
      }),
    } as Response);
    await firstFetch;

    expect(useMarketStore.getState().exchange).toBe('okx');
    expect(useMarketStore.getState().symbol).toBe('ETHUSDT');
    expect(useMarketStore.getState().interval).toBe('5m');
    expect(useMarketStore.getState().klines).toEqual([
      makeKline({ exchange: 'okx', symbol: 'ETHUSDT', interval: '5m', open_time: 10 }),
    ]);
  });

  it('ignores realtime kline updates that do not belong to the active market', () => {
    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'ETHUSDT',
      interval: '5m',
      klines: [makeKline({ exchange: 'okx', symbol: 'ETHUSDT', interval: '5m', open_time: 5 })],
    });

    useMarketStore.getState().updateKline(
      makeKline({ exchange: 'binance', symbol: 'BTCUSDT', interval: '1h', open_time: 99 }),
    );

    expect(useMarketStore.getState().klines).toEqual([
      makeKline({ exchange: 'okx', symbol: 'ETHUSDT', interval: '5m', open_time: 5 }),
    ]);
  });
});
