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
  indicatorSettings: {
    volume: false,
    ma5: false,
    ma10: false,
    ma20: false,
  } as IndicatorSettings,
  updateIndicatorSetting: vi.fn(),
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
    mockMarketState.indicatorSettings = {
      volume: false,
      ma5: false,
      ma10: false,
      ma20: false,
    };
  });

  it('renders a slimmer chart workspace header around the toolbar and indicator entry', () => {
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
    expect(markup).toContain('指标');
    expect(markup).toContain('chart-workspace__header');
    expect(markup).toContain('chart-workspace__header-main');
    expect(markup).toContain('chart-workspace__header-actions');
    expect(markup).toContain('chart-panel__hud');
    expect(markup).toContain('ETH/USDT · 5分钟 · BINANCE');
    expect(markup).toContain('chart-inspector__metric-label">开<');
    expect(markup).toContain('2,019.00');
    expect(markup).not.toContain('chart-workspace__toolbar-shell');
    expect(markup).not.toContain('chart-badges');
    expect(markup).not.toContain('缓存');
    expect(markup).not.toContain('推送中');
    expect(markup).not.toContain('chart-panel__summary-row');
    expect(markup).not.toContain('成交量');
    expect(markup).not.toContain('成交额');
    expect(markup).not.toContain('MA5');
    expect(markup).not.toContain('MA10');
    expect(markup).not.toContain('MA20');
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
    };

    const markup = renderToStaticMarkup(<KlineChart />);

    expect(markup).toContain('成交量 (Volume)');
    expect(markup).toContain('MA5');
    expect(markup).not.toContain('MA10');
    expect(markup).not.toContain('MA20');
    expect(markup).not.toContain('成交额');
  });
});
