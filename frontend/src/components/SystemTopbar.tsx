import React, { useEffect, useState } from 'react';
import { formatLivePrice, formatMarketSymbol } from '../lib/marketDisplay';
import { useMarketStore } from '../stores/marketStore';
import { useUiStore } from '../stores/uiStore';

function formatSystemTime(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

export const SystemTopbar: React.FC = () => {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const isConnected = useMarketStore((state) => state.isConnected);
  const exchange = useMarketStore((state) => state.exchange);
  const symbol = useMarketStore((state) => state.symbol);
  const latestPrice = useMarketStore((state) => state.latestPrice);
  const [systemTime, setSystemTime] = useState(() => formatSystemTime(new Date()));

  const marketLabel = `${formatMarketSymbol(symbol)} · ${exchange.toUpperCase()}`;
  const latestPriceLabel = latestPrice !== null ? formatLivePrice(latestPrice) : '等待价格';
  const statusLabel = isConnected ? '连接在线' : '等待重连';
  const themeLabel = theme === 'dark' ? '暗系' : '亮系';

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSystemTime(formatSystemTime(new Date()));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <header className="system-topbar">
      <div className="system-topbar__leading">
        <button
          type="button"
          className={`sidebar-toggle ${isSidebarCollapsed ? 'sidebar-toggle--collapsed' : 'sidebar-toggle--expanded'}`}
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <span className="sidebar-toggle__icon" aria-hidden="true">
            {isSidebarCollapsed ? (
              <svg viewBox="0 0 20 20" className="sidebar-toggle__svg">
                <path d="M7 4L13 10L7 16" />
                <path d="M4 4V16" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="sidebar-toggle__svg">
                <path d="M13 4L7 10L13 16" />
                <path d="M16 4V16" />
              </svg>
            )}
          </span>
        </button>

        <div className="system-topbar__ticker">
          <span className="system-topbar__ticker-label">实时行情</span>
          <div className="system-topbar__ticker-main">
            <strong className="system-topbar__price">{latestPriceLabel}</strong>
            <span className="system-topbar__market">{marketLabel}</span>
          </div>
        </div>
      </div>

      <div className="system-topbar__utilities">
        <button
          type="button"
          className={`theme-toggle theme-toggle--${theme}`}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          aria-pressed={theme === 'light'}
        >
          <span className="theme-toggle__track" aria-hidden="true">
            <span className="theme-toggle__thumb" />
          </span>
          <span className="theme-toggle__icon" aria-hidden="true">
            {theme === 'dark' ? '☾' : '☼'}
          </span>
          <span className="theme-toggle__label">{themeLabel}</span>
        </button>

        <div className="system-topbar__clock" role="timer" aria-live="polite">
          <span className="system-topbar__clock-label">系统时间</span>
          <strong className="system-topbar__clock-value">{systemTime}</strong>
        </div>

        <div className="system-topbar__status" role="status" aria-live="polite" aria-label={statusLabel}>
          <span className={`signal-light signal-light--${isConnected ? 'live' : 'waiting'}`} aria-hidden="true" />
        </div>
      </div>
    </header>
  );
};
