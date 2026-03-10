import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../stores/uiStore';

const mockMarketState = {
  isConnected: true,
  exchange: 'binance',
  symbol: 'ETHUSDT',
  latestPrice: 2019.27,
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the live market title in place of the workspace title', () => {
    const markup = renderToStaticMarkup(<SystemTopbar />);

    expect(markup).toContain('Quant Trade System mark');
    expect(markup).toContain('$2,019.27');
    expect(markup).toContain('ETH/USDT');
    expect(markup).toContain('BINANCE');
    expect(markup).toContain('收起侧边栏');
    expect(markup).toContain('aria-label="链路在线"');
    expect(markup).toContain('signal-light');
    expect(markup).toContain('系统时间');
    expect(markup).toContain('2026-03-09 23:16:17');
    expect(markup).toContain('aria-label="切换到亮色主题"');
    expect(markup).not.toContain('实时更新中');
    expect(markup).not.toContain('system-topbar__status-text');
    expect(markup).not.toContain('后台工作台');
  });
});
