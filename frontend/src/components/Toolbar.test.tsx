import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SymbolOption } from '../types';

const mockMarketState = {
  exchange: 'binance',
  symbol: 'ETHUSDT',
  interval: '1h',
  symbols: [
    { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
    { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  ] as SymbolOption[],
  isLoadingSymbols: false,
  setExchange: vi.fn(),
  setSymbol: vi.fn(),
  setInterval: vi.fn(),
  fetchSymbols: vi.fn(async () => undefined),
};

vi.mock('../stores/marketStore', () => ({
  useMarketStore: (selector?: (state: typeof mockMarketState) => unknown) =>
    typeof selector === 'function' ? selector(mockMarketState) : mockMarketState,
}));

import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  beforeEach(() => {
    mockMarketState.exchange = 'binance';
    mockMarketState.symbol = 'ETHUSDT';
    mockMarketState.interval = '1h';
    mockMarketState.symbols = [
      { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
      { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
    ];
    mockMarketState.isLoadingSymbols = false;
  });

  it('renders icon-aware custom controls for exchange and symbol fields', () => {
    const markup = renderToStaticMarkup(<Toolbar />);

    expect(markup).toContain('data-testid="exchange-select-trigger"');
    expect(markup).toContain('data-testid="symbol-select-trigger"');
    expect(markup).toContain('market-icon--exchange');
    expect(markup).toContain('market-icon--exchange-binance');
    expect(markup).toContain('market-icon--asset');
    expect(markup).toContain('market-icon--asset-eth');
    expect(markup).toContain('ETH/USDT');
    expect(markup).toContain('id="interval-select"');
  });
});
