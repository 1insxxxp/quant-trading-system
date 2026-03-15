import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../stores/uiStore';
import type { SymbolOption } from '../types';

const mockMarketState = {
  isConnected: true,
  realtimeUpdateState: 'connected' as const,
  wsLatency: null,
  wsLatencyStatus: 'unknown' as const,
  wsReconnectCount: 0,
  toasts: [],
  exchange: 'binance',
  symbol: 'ETHUSDT',
  symbols: [
    { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
    { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  ] as SymbolOption[],
  isLoadingSymbols: false,
  setExchange: vi.fn(),
  setSymbol: vi.fn(),
  fetchSymbols: vi.fn(async () => undefined),
  latestPrice: 2019.27,
  klines: [
    {
      exchange: 'binance',
      symbol: 'ETHUSDT',
      interval: '1h',
      open_time: 1,
      close_time: 2,
      open: 2000,
      high: 2025,
      low: 1995,
      close: 2019.27,
      volume: 20,
      quote_volume: 40385.4,
      is_closed: 0,
    },
  ],
};

vi.mock('../stores/marketStore', () => ({
  useMarketStore: (selector: (state: typeof mockMarketState) => unknown) => selector(mockMarketState),
}));

import { SystemTopbar } from './SystemTopbar';

describe('SystemTopbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T15:16:17Z'));
    useUiStore.setState({
      isSidebarCollapsed: false,
      theme: 'dark',
      setSidebarCollapsed: () => undefined,
      setTheme: () => undefined,
      toggleTheme: () => undefined,
      toggleSidebar: () => undefined,
    });
    mockMarketState.isConnected = true;
    mockMarketState.exchange = 'binance';
    mockMarketState.symbol = 'ETHUSDT';
    mockMarketState.latestPrice = 2019.27;
    mockMarketState.symbols = [
      { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
      { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
    ];
    mockMarketState.isLoadingSymbols = false;
    mockMarketState.setExchange.mockReset();
    mockMarketState.setSymbol.mockReset();
    mockMarketState.fetchSymbols.mockReset();
    mockMarketState.fetchSymbols.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a compact utility strip around the live market readout', () => {
    const markup = renderToStaticMarkup(<SystemTopbar />);

    expect(markup).toContain('\u5b9e\u65f6\u884c\u60c5');
    expect(markup).toContain('$2,019.27');
    expect(markup).toContain('ETH/USDT');
    expect(markup).toContain('BINANCE');
    expect(markup).toContain('\u6536\u8d77\u4fa7\u8fb9\u680f');
    expect(markup).toContain('connection-status');
    expect(markup).toContain('已连接');
    expect(markup).toContain('system-topbar__price-section');
    expect(markup).toContain('system-topbar__controls');
    expect(markup).toContain('rolling-digits');
    expect(markup).toContain('data-testid="topbar-exchange-select-trigger"');
    expect(markup).toContain('data-testid="topbar-symbol-select-trigger"');
    expect(markup).not.toContain('\\u');
    expect(markup).not.toContain('Quant Trade System mark');
    expect(markup).not.toContain('system-topbar__brand-mark');
  });
});
