import React, { useEffect } from 'react';
import { formatLivePrice, formatMarketSymbol } from '../lib/marketDisplay';
import { useMarketStore } from '../stores/marketStore';
import { useUiStore } from '../stores/uiStore';
import { ExchangeIcon, AssetIcon } from './marketIcons';
import { MarketSelect, type MarketSelectOption } from './MarketSelect';
import { RollingDigits } from './RollingDigits';
const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'okx', label: 'OKX' },
];

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
export const SystemTopbar: React.FC = () => {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const realtimeUpdateState = useMarketStore((state) => state.realtimeUpdateState);
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

  const getStatusConfig = () => {
    switch (realtimeUpdateState) {
      case 'connected':
        return { class: 'live', label: '连接在线' };
      case 'reconnecting':
        return { class: 'reconnecting', label: '正在重连' };
      case 'connecting':
        return { class: 'waiting', label: '正在连接' };
      case 'disconnected':
      default:
        return { class: 'waiting', label: '连接断开' };
    }
  };

  const statusConfig = getStatusConfig();
  const priceTone = resolvePriceTone({
    latestPrice,
    latestKlineOpen: latestKline?.open ?? null,
    latestKlineClose: latestKline?.close ?? null,
  });

  useEffect(() => {
    void fetchSymbols();
  }, [fetchSymbols]);

  return (
    <header className="system-topbar">
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

      <div className="system-topbar__price-section">
        <span className="system-topbar__price-label">实时行情</span>
        <strong className={`system-topbar__price system-topbar__price--${priceTone}`}>
          <RollingDigits value={latestPriceLabel} />
        </strong>
        <span className="system-topbar__market">{marketLabel}</span>
      </div>

      <div className="system-topbar__controls">
        <div className="system-topbar__control-group">
          <label className="system-topbar__label">交易所</label>
          <MarketSelect
            label=""
            value={exchange}
            options={exchangeOptions}
            onChange={setExchange}
            testId="topbar-exchange-select"
          />
        </div>
        <div className="system-topbar__control-group">
          <label className="system-topbar__label">交易对</label>
          <MarketSelect
            label=""
            value={symbol}
            options={marketSymbolOptions}
            onChange={setSymbol}
            disabled={marketSymbolOptions.length === 0 || marketSymbolOptions[0]?.disabled === true}
            testId="topbar-symbol-select"
          />
        </div>
      </div>

      <div className="system-topbar__status" role="status" aria-live="polite" aria-label={statusConfig.label}>
        <span
          className={`signal-light signal-light--${statusConfig.class}`}
          aria-hidden="true"
        />
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
