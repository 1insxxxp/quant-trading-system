import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketStore } from './marketStore';
import type { IndicatorSettings, Kline } from '../types';

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
        lastPriceTimestamp: null,
        isConnected: false,
        isLoadingKlines: false,
        isLoadingOlderKlines: false,
        hasMoreHistoricalKlines: true,
        indicatorSettings: {
          volume: false,
          ma5: false,
          ma10: false,
          ma20: false,
        } satisfies IndicatorSettings,
        isLoadingIndicatorSettings: false,
      },
      true,
    );
    vi.restoreAllMocks();
  });

  it('preserves the previous chart while the next market is loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)) as typeof fetch,
    );

    useMarketStore.setState({
      klines: [makeKline()],
      latestPrice: 99999,
    });

    useMarketStore.getState().setExchange('okx');

    expect(useMarketStore.getState().klines).toEqual([makeKline()]);
    expect(useMarketStore.getState().latestPrice).toBeNull();
    expect(useMarketStore.getState().isLoadingKlines).toBe(true);
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

    const firstFetch = useMarketStore.getState().loadInitialKlines();

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'ETHUSDT',
      interval: '5m',
    });

    const secondFetch = useMarketStore.getState().loadInitialKlines();

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
    expect(useMarketStore.getState().klineSource).toBe('remote');
    expect(useMarketStore.getState().klines).toEqual([
      makeKline({ exchange: 'okx', symbol: 'ETHUSDT', interval: '5m', open_time: 10 }),
    ]);
  });

  it('stores the backend-provided kline source when historical data loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          source: 'cache',
          klines: [makeKline()],
          count: 1,
        }),
      }) as Response) as typeof fetch,
    );

    await useMarketStore.getState().loadInitialKlines();

    expect(useMarketStore.getState().isLoadingKlines).toBe(false);
    expect(useMarketStore.getState().klineSource).toBe('cache');
    expect(useMarketStore.getState().klines).toEqual([makeKline()]);
  });

  it('requests 2000 bars for the initial market load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        expect(input).toContain('limit=2000');

        return {
          ok: true,
          json: async () => ({
            success: true,
            source: 'remote',
            klines: [makeKline()],
          }),
        } as Response;
      }) as typeof fetch,
    );

    await useMarketStore.getState().loadInitialKlines();
  });

  it('requests older bars before the current earliest open time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        expect(input).toContain('limit=1000');
        expect(input).toContain('before=100');

        return {
          ok: true,
          json: async () => ({
            success: true,
            source: 'cache',
            klines: [makeKline({ open_time: 10, close_time: 11 })],
          }),
        } as Response;
      }) as typeof fetch,
    );

    useMarketStore.setState({
      klines: [makeKline({ open_time: 100, close_time: 101 })],
      hasMoreHistoricalKlines: true,
    } as Partial<ReturnType<typeof useMarketStore.getState>>);

    await useMarketStore.getState().loadOlderKlines();
  });

  it('uses backend hasMore instead of guessing from page size on initial load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          source: 'remote',
          hasMore: false,
          klines: [makeKline()],
        }),
      }) as Response) as typeof fetch,
    );

    await useMarketStore.getState().loadInitialKlines();

    expect(useMarketStore.getState().hasMoreHistoricalKlines).toBe(false);
  });

  it('uses backend hasMore instead of guessing from page size on older history loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          source: 'cache',
          hasMore: false,
          klines: [makeKline({ open_time: 10, close_time: 11 })],
        }),
      }) as Response) as typeof fetch,
    );

    useMarketStore.setState({
      klines: [makeKline({ open_time: 100, close_time: 101 })],
      hasMoreHistoricalKlines: true,
    } as Partial<ReturnType<typeof useMarketStore.getState>>);

    await useMarketStore.getState().loadOlderKlines();

    expect(useMarketStore.getState().hasMoreHistoricalKlines).toBe(false);
  });

  it('normalizes fetched klines into ascending unique open times before storing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          source: 'remote',
          klines: [
            makeKline({ exchange: 'okx', open_time: 20, close_time: 21, close: 220 }),
            makeKline({ exchange: 'okx', open_time: 10, close_time: 11, close: 110 }),
            makeKline({ exchange: 'okx', open_time: 20, close_time: 21, close: 225 }),
          ],
        }),
      }) as Response) as typeof fetch,
    );

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'BTCUSDT',
      interval: '1h',
    });

    await useMarketStore.getState().loadInitialKlines();

    expect(useMarketStore.getState().klines).toEqual([
      makeKline({ exchange: 'okx', open_time: 10, close_time: 11, close: 110 }),
      makeKline({ exchange: 'okx', open_time: 20, close_time: 21, close: 225 }),
    ]);
  });

  it('marks klines as loading until the historical request resolves', async () => {
    const response = deferred<Response>();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise) as typeof fetch,
    );

    const fetchPromise = useMarketStore.getState().loadInitialKlines();

    expect(useMarketStore.getState().isLoadingKlines).toBe(true);

    response.resolve({
      ok: true,
      json: async () => ({
        success: true,
        source: 'remote',
        klines: [makeKline()],
      }),
    } as Response);

    await fetchPromise;

    expect(useMarketStore.getState().isLoadingKlines).toBe(false);
  });

  it('falls back cleanly when the backend returns a non-json error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => '',
      }) as Response) as typeof fetch,
    );

    await useMarketStore.getState().loadInitialKlines();
    await useMarketStore.getState().fetchSymbols();

    expect(useMarketStore.getState().klines).toEqual([]);
    expect(useMarketStore.getState().klineSource).toBe('empty');
    expect((useMarketStore.getState() as any).symbols).toEqual([
      { value: 'BTCUSDT', label: 'BTC/USDT' },
      { value: 'ETHUSDT', label: 'ETH/USDT' },
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

  it('updates the latest price independently without mutating the loaded klines', () => {
    const existingKlines = [
      makeKline({ open_time: 100, close_time: 101, close: 110 }),
      makeKline({ open_time: 200, close_time: 201, close: 120 }),
    ];

    useMarketStore.setState({
      klines: existingKlines,
      latestPrice: 120,
      lastPriceTimestamp: 2000,
    } as Partial<ReturnType<typeof useMarketStore.getState>>);

    useMarketStore.getState().setLatestPrice(125, 3000);

    expect(useMarketStore.getState().latestPrice).toBe(125);
    expect(useMarketStore.getState().lastPriceTimestamp).toBe(3000);
    expect(useMarketStore.getState().klines).toEqual(existingKlines);
  });

  it('ignores stale latest-price updates that arrive out of order', () => {
    useMarketStore.setState({
      latestPrice: 125,
      lastPriceTimestamp: 3000,
    } as Partial<ReturnType<typeof useMarketStore.getState>>);

    useMarketStore.getState().setLatestPrice(121, 2500);

    expect(useMarketStore.getState().latestPrice).toBe(125);
    expect(useMarketStore.getState().lastPriceTimestamp).toBe(3000);
  });

  it('loads backend symbols for the active exchange and keeps only BTC/ETH pairs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        expect(input).toBe('/quant/api/symbols?exchange=okx&type=spot');

        return {
          json: async () => ({
            success: true,
            symbols: [
              { exchange: 'okx', symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', type: 'spot' },
              { exchange: 'okx', symbol: 'ETHUSDT', base_asset: 'ETH', quote_asset: 'USDT', type: 'spot' },
              { exchange: 'okx', symbol: 'SOLUSDT', base_asset: 'SOL', quote_asset: 'USDT', type: 'spot' },
            ],
          }),
        } as Response;
      }) as typeof fetch,
    );

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'BTCUSDT',
    });

    await (useMarketStore.getState() as any).fetchSymbols();

    expect((useMarketStore.getState() as any).symbols).toEqual([
      { value: 'BTCUSDT', label: 'BTC/USDT' },
      { value: 'ETHUSDT', label: 'ETH/USDT' },
    ]);
    expect((useMarketStore.getState() as any).isLoadingSymbols).toBe(false);
  });

  it('replaces the active symbol when the fetched list no longer contains it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          success: true,
          symbols: [
            { exchange: 'okx', symbol: 'ETHUSDT', base_asset: 'ETH', quote_asset: 'USDT', type: 'spot' },
          ],
        }),
      }) as Response) as typeof fetch,
    );

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'BTCUSDT',
    });

    await (useMarketStore.getState() as any).fetchSymbols();

    expect(useMarketStore.getState().symbol).toBe('ETHUSDT');
  });

  it('falls back to default BTC/ETH symbols when symbol loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as typeof fetch,
    );

    useMarketStore.setState({
      exchange: 'okx',
      symbol: 'BTCUSDT',
    });

    await (useMarketStore.getState() as any).fetchSymbols();

    expect((useMarketStore.getState() as any).symbols).toEqual([
      { value: 'BTCUSDT', label: 'BTC/USDT' },
      { value: 'ETHUSDT', label: 'ETH/USDT' },
    ]);
    expect((useMarketStore.getState() as any).isLoadingSymbols).toBe(false);
  });

  it('loads backend indicator settings and keeps unknown keys ignored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          settings: {
            volume: true,
            ma5: true,
            ma10: false,
            ma20: true,
            ema: true,
          },
        }),
      }) as Response) as typeof fetch,
    );

    await useMarketStore.getState().fetchIndicatorSettings();

    expect(useMarketStore.getState().indicatorSettings).toEqual({
      volume: true,
      ma5: true,
      ma10: false,
      ma20: true,
    });
    expect(useMarketStore.getState().isLoadingIndicatorSettings).toBe(false);
  });

  it('falls back to default indicator settings and stops retrying when the preferences route returns 404', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }) as Response);
    vi.stubGlobal('fetch', fetchSpy);

    useMarketStore.setState({
      indicatorSettings: {
        volume: true,
        ma5: true,
        ma10: true,
        ma20: true,
      },
    });

    await useMarketStore.getState().fetchIndicatorSettings();
    await useMarketStore.getState().fetchIndicatorSettings();

    expect(useMarketStore.getState().indicatorSettings).toEqual({
      volume: false,
      ma5: false,
      ma10: false,
      ma20: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('updates indicator settings optimistically and persists to backend', async () => {
    const fetchSpy = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        success: true,
        settings: JSON.parse(String(init?.body ?? '{}')).settings,
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchSpy);

    await useMarketStore.getState().updateIndicatorSetting('ma10', true);

    expect(useMarketStore.getState().indicatorSettings.ma10).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/quant/api/preferences/chart-indicators',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });

  it('keeps local indicator settings when the preferences route is unavailable', async () => {
    const fetchSpy = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: false,
      status: 404,
      text: async () => '',
      json: async () => ({
        success: false,
        settings: JSON.parse(String(init?.body ?? '{}')).settings,
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchSpy);

    await useMarketStore.getState().updateIndicatorSetting('ma10', true);
    await useMarketStore.getState().updateIndicatorSetting('ma20', true);

    expect(useMarketStore.getState().indicatorSettings).toEqual({
      volume: false,
      ma5: false,
      ma10: true,
      ma20: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
