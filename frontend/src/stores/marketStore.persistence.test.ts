import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MARKET_SELECTION_STORAGE_KEY = 'quant-market-selection';

function createStorage(initialValues?: Record<string, string>) {
  const store = new Map(Object.entries(initialValues ?? {}));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe('marketStore persistence', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the active market selection from sessionStorage on store creation', async () => {
    vi.stubGlobal(
      'sessionStorage',
      createStorage({
        [MARKET_SELECTION_STORAGE_KEY]: JSON.stringify({
          exchange: 'okx',
          symbol: 'ETHUSDT',
          interval: '5m',
        }),
      }),
    );

    const { useMarketStore } = await import('./marketStore');

    expect(useMarketStore.getState().exchange).toBe('okx');
    expect(useMarketStore.getState().symbol).toBe('ETHUSDT');
    expect(useMarketStore.getState().interval).toBe('5m');
  });

  it('writes updated market selection back to sessionStorage', async () => {
    const storage = createStorage();
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)) as typeof fetch,
    );

    const { useMarketStore } = await import('./marketStore');

    useMarketStore.getState().setExchange('okx');
    useMarketStore.getState().setSymbol('ETHUSDT');
    useMarketStore.getState().setInterval('5m');

    expect(storage.setItem).toHaveBeenLastCalledWith(
      MARKET_SELECTION_STORAGE_KEY,
      JSON.stringify({
        exchange: 'okx',
        symbol: 'ETHUSDT',
        interval: '5m',
      }),
    );
  });
});
