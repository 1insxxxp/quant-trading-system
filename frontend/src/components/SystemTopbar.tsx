import React, { useEffect, useMemo, useState } from 'react';
import { formatLivePrice, formatMarketSymbol } from '../lib/marketDisplay';
import { useMarketStore } from '../stores/marketStore';
import { useUiStore } from '../stores/uiStore';
import { ExchangeIcon, AssetIcon } from './marketIcons';
import { MarketSelect, type MarketSelectOption } from './MarketSelect';

const DIGIT_TRACK = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'okx', label: 'OKX' },
];

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

function resolvePriceTone(params: {
  latestPrice: number | null;
  latestKlineOpen: number | null;
  latestKlineClose: number | null;
}): 'up' | 'down' | 'flat' {
  const { latestPrice, latestKlineOpen, latestKlineClose } = params;

  if (latestPrice !== null && latestKlineOpen !== null) {
    if (latestPrice > latestKlineOpen) {
      return 'up';
    }
    if (latestPrice < latestKlineOpen) {
      return 'down';
    }
  }

  if (latestKlineClose !== null && latestKlineOpen !== null) {
    if (latestKlineClose > latestKlineOpen) {
      return 'up';
    }
    if (latestKlineClose < latestKlineOpen) {
      return 'down';
    }
  }

  return 'flat';
}

function RollingDigits({ value, className }: { value: string; className?: string }) {
  const characters = useMemo(() => Array.from(value), [value]);

  return (
    <span className={['rolling-digits', className].filter(Boolean).join(' ')} aria-label={value}>
      <span className="rolling-digits__raw">{value}</span>
      {characters.map((char, index) => {
        if (!/[0-9]/.test(char)) {
          return (
            <span key={`sep-${index}-${char}`} className="rolling-digits__separator" aria-hidden="true">
              {char}
            </span>
          );
        }

        return (
          <span key={`digit-${index}`} className="rolling-digits__digit" aria-hidden="true">
            <span
              className="rolling-digits__track"
              style={{ '--digit-target': Number(char) } as React.CSSProperties}
            >
              {DIGIT_TRACK.map((digit) => (
                <span key={`${index}-${digit}`} className="rolling-digits__cell">
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export const SystemTopbar: React.FC = () => {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const isConnected = useMarketStore((state) => state.isConnected);
  const exchange = useMarketStore((state) => state.exchange);
  const symbol = useMarketStore((state) => state.symbol);
  const symbols = useMarketStore((state) => state.symbols);
  const isLoadingSymbols = useMarketStore((state) => state.isLoadingSymbols);
  const setExchange = useMarketStore((state) => state.setExchange);
  const setSymbol = useMarketStore((state) => state.setSymbol);
  const fetchSymbols = useMarketStore((state) => state.fetchSymbols);
  const latestPrice = useMarketStore((state) => state.latestPrice);
  const latestKline = useMarketStore((state) => {
    const activeKlines = state.klines ?? [];
    return activeKlines[activeKlines.length - 1] ?? null;
  });
  const [systemTime, setSystemTime] = useState(() => formatSystemTime(new Date()));

  const symbolOptions = symbols.length > 0
    ? symbols
    : [{ value: '', label: isLoadingSymbols ? '加载中...' : '暂无交易对' }];

  const exchangeOptions: MarketSelectOption[] = EXCHANGES.map((exchangeOption) => ({
    value: exchangeOption.value,
    label: exchangeOption.label,
    icon: <ExchangeIcon exchange={exchangeOption.value} />,
  }));

  const marketSymbolOptions: MarketSelectOption[] = symbolOptions.map((symbolOption) => ({
    value: symbolOption.value,
    label: symbolOption.label,
    icon: <AssetIcon asset={symbolOption.baseAsset ?? resolveBaseAsset(symbolOption)} />,
    disabled: symbolOption.value === '',
  }));

  const marketLabel = `${formatMarketSymbol(symbol)} · ${exchange.toUpperCase()}`;
  const latestPriceLabel = latestPrice !== null ? formatLivePrice(latestPrice) : '等待价格';
  const statusLabel = isConnected ? '连接在线' : '等待重连';
  const themeLabel = theme === 'dark' ? '暗系' : '亮系';
  const priceTone = resolvePriceTone({
    latestPrice,
    latestKlineOpen: latestKline?.open ?? null,
    latestKlineClose: latestKline?.close ?? null,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSystemTime(formatSystemTime(new Date()));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void fetchSymbols();
  }, [fetchSymbols]);

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
          <span className={`system-topbar__ticker-label system-topbar__ticker-label--${priceTone}`}>实时行情</span>
          <div className="system-topbar__ticker-main">
            <strong className={`system-topbar__price system-topbar__price--${priceTone}`}>
              <RollingDigits value={latestPriceLabel} />
            </strong>
            <span className="system-topbar__market">{marketLabel}</span>
          </div>
        </div>

        <div className="topbar-market-controls">
          <div className="topbar-market-controls__field">
            <MarketSelect
              label="交易所"
              value={exchange}
              options={exchangeOptions}
              onChange={setExchange}
              testId="topbar-exchange-select"
            />
          </div>
          <div className="topbar-market-controls__field">
            <MarketSelect
              label="交易对"
              value={symbol}
              options={marketSymbolOptions}
              onChange={setSymbol}
              disabled={marketSymbolOptions.length === 0 || marketSymbolOptions[0]?.disabled === true}
              testId="topbar-symbol-select"
            />
          </div>
        </div>
      </div>

      <div className="system-topbar__utilities system-topbar__utility-strip">
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
            {theme === 'dark' ? '☾' : '☀'}
          </span>
          <span className="theme-toggle__label">{themeLabel}</span>
        </button>

        <div className="system-topbar__clock" role="timer" aria-live="polite">
          <span className="system-topbar__clock-label">系统时间</span>
          <strong className="system-topbar__clock-value">
            <RollingDigits value={systemTime} className="rolling-digits--clock" />
          </strong>
        </div>

        <div className="system-topbar__status" role="status" aria-live="polite" aria-label={statusLabel}>
          <span
            className={`signal-light system-topbar__status-dot signal-light--${isConnected ? 'live' : 'waiting'}`}
            aria-hidden="true"
          />
        </div>
      </div>
    </header>
  );
};

function resolveBaseAsset(symbolOption: { value: string; label: string }) {
  const labelBase = symbolOption.label.split('/')[0];

  if (labelBase) {
    return labelBase.toUpperCase();
  }

  return symbolOption.value.replace(/USDT$/i, '').slice(0, 6).toUpperCase();
}
