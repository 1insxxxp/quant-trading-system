import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndicatorSettings, Kline } from '../types';

const mockMarketState = {
  exchange: 'binance',
  symbol: 'ETHUSDT',
  interval: '5m',
  klines: [] as Kline[],
  klineSource: 'remote',
  isConnected: true,
  isLoadingKlines: false,
  isLoadingOlderKlines: false,
  olderKlineLoadError: null as string | null,
  indicatorSettings: {
    volume: false,
    ma5: false,
    ma10: false,
    ma20: false,
  } as IndicatorSettings,
  updateIndicatorSetting: vi.fn(),
  retryLoadOlderKlines: vi.fn(async () => undefined),
};

vi.mock('../stores/marketStore', () => ({
  useMarketStore: (selector?: (state: typeof mockMarketState) => unknown) =>
    typeof selector === 'function' ? selector(mockMarketState) : mockMarketState,
}));

vi.mock('./Toolbar', () => ({
  Toolbar: () => <div>toolbar</div>,
}));

import { KlineChart } from './KlineChart';

describe('KlineChart', () => {
  beforeEach(() => {
    mockMarketState.exchange = 'binance';
    mockMarketState.symbol = 'ETHUSDT';
    mockMarketState.interval = '5m';
    mockMarketState.klines = [];
    mockMarketState.klineSource = 'remote';
    mockMarketState.isConnected = true;
    mockMarketState.isLoadingKlines = false;
    mockMarketState.isLoadingOlderKlines = false;
    mockMarketState.olderKlineLoadError = null;
    mockMarketState.indicatorSettings = {
      volume: false,
      ma5: false,
      ma10: false,
      ma20: false,
      ema12: false,
      ema26: false,
      rsi: false,
      macd: false,
      bollinger: false,
    };
  });

  it('renders a slimmer chart workspace header around the terminal toolbar', () => {
    mockMarketState.klines = Array.from({ length: 20 }, (_, index) => ({
      exchange: 'binance',
      symbol: 'ETHUSDT',
      interval: '5m',
      open_time: 1_741_536_000_000 + index * 300_000,
      close_time: 1_741_536_300_000 + index * 300_000,
      open: 2000 + index,
      high: 2004 + index,
      low: 1996 + index,
      close: 2001 + index,
      volume: 10 + index,
      quote_volume: 20_000 + index * 100,
      is_closed: 1,
    }));

    const markup = renderToStaticMarkup(<KlineChart />);

    expect(markup).toContain('toolbar');
    expect(markup).toContain('chart-workspace__header');
    expect(markup).toContain('chart-workspace__header--terminal');
    expect(markup).toContain('chart-workspace__header-main');
    expect(markup).not.toContain('chart-workspace__header-actions');
    expect(markup).toContain('chart-panel__hud');
    expect(markup).toContain('chart-panel__hud--terminal');
    expect(markup).toContain('ETH/USDT \u00b7 5\u5206\u949f \u00b7 BINANCE');
    expect(markup).toContain('chart-inspector__metric-label">\u5f00<');
    expect(markup).toContain('2,019.00');
  });

  it('renders enabled indicators in the legend', () => {
    mockMarketState.klines = Array.from({ length: 20 }, (_, index) => ({
      exchange: 'binance',
      symbol: 'ETHUSDT',
      interval: '5m',
      open_time: 1_741_536_000_000 + index * 300_000,
      close_time: 1_741_536_300_000 + index * 300_000,
      open: 2000 + index,
      high: 2004 + index,
      low: 1996 + index,
      close: 2001 + index,
      volume: 10 + index,
      quote_volume: 20_000 + index * 100,
      is_closed: 1,
    }));
    mockMarketState.indicatorSettings = {
      volume: true,
      ma5: true,
      ma10: false,
      ma20: false,
      ema12: false,
      ema26: false,
      rsi: false,
      macd: false,
      bollinger: false,
    };

    const markup = renderToStaticMarkup(<KlineChart />);

    expect(markup).toContain('\u6210\u4ea4\u91cf (Volume)');
    expect(markup).toContain('MA5');
    expect(markup).not.toContain('MA10');
    expect(markup).not.toContain('MA20');
  });

  it('renders a compact left-edge history loading rail while older history is loading', () => {
    mockMarketState.klines = Array.from({ length: 4 }, (_, index) => ({
      exchange: 'binance',
      symbol: 'ETHUSDT',
      interval: '5m',
      open_time: 1_741_536_000_000 + index * 300_000,
      close_time: 1_741_536_300_000 + index * 300_000,
      open: 2000 + index,
      high: 2004 + index,
      low: 1996 + index,
      close: 2001 + index,
      volume: 10 + index,
      quote_volume: 20_000 + index * 100,
      is_closed: 1,
    }));
    mockMarketState.isLoadingOlderKlines = true;

    const markup = renderToStaticMarkup(<KlineChart />);

    expect(markup).toContain('chart-history-edge chart-history-edge--loading');
    expect(markup).toContain('chart-history-edge__rail');
    expect(markup).toContain('chart-history-edge__beam');
    expect(markup).toContain('chart-history-edge__label');
    expect(markup).toContain('\u52a0\u8f7d\u5386\u53f2');
  });

  it('renders a compact left-edge retry affordance when older history loading fails', () => {
    mockMarketState.klines = Array.from({ length: 4 }, (_, index) => ({
      exchange: 'binance',
      symbol: 'ETHUSDT',
      interval: '5m',
      open_time: 1_741_536_000_000 + index * 300_000,
      close_time: 1_741_536_300_000 + index * 300_000,
      open: 2000 + index,
      high: 2004 + index,
      low: 1996 + index,
      close: 2001 + index,
      volume: 10 + index,
      quote_volume: 20_000 + index * 100,
      is_closed: 1,
    }));
    mockMarketState.olderKlineLoadError = 'HTTP 502';

    const markup = renderToStaticMarkup(<KlineChart />);

    expect(markup).toContain('chart-history-edge chart-history-edge--error');
    expect(markup).toContain('chart-history-edge__label');
    expect(markup).toContain('chart-history-edge__retry');
    expect(markup).toContain('\u52a0\u8f7d\u5931\u8d25');
    expect(markup).toContain('aria-label="重试加载历史K线"');
  });
});
