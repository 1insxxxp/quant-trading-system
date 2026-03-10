import React, { useEffect } from 'react';
import { useMarketStore } from '../stores/marketStore';
import { ExchangeIcon, AssetIcon } from './marketIcons';
import { MarketSelect, type MarketSelectOption } from './MarketSelect';

const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'okx', label: 'OKX' },
];

const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
];

export const Toolbar: React.FC = () => {
  const {
    exchange,
    symbol,
    interval,
    symbols,
    isLoadingSymbols,
    setExchange,
    setSymbol,
    setInterval,
    fetchSymbols,
  } = useMarketStore();

  useEffect(() => {
    void fetchSymbols();
  }, [fetchSymbols]);

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

  return (
    <div className="toolbar-inline toolbar-inline--terminal">
      <div className="toolbar-field toolbar-field--terminal">
        <MarketSelect
          label="交易所"
          value={exchange}
          options={exchangeOptions}
          onChange={setExchange}
          testId="exchange-select"
        />
      </div>

      <div className="toolbar-field toolbar-field--terminal">
        <MarketSelect
          label="交易对"
          value={symbol}
          options={marketSymbolOptions}
          onChange={setSymbol}
          disabled={marketSymbolOptions.length === 0 || marketSymbolOptions[0]?.disabled === true}
          testId="symbol-select"
        />
      </div>

      <div className="toolbar-field toolbar-field--terminal">
        <label className="toolbar-label" htmlFor="interval-select">周期</label>
        <select
          id="interval-select"
          value={interval}
          onChange={(event) => setInterval(event.target.value)}
          className="toolbar-select toolbar-select--terminal"
          data-testid="interval-select"
        >
          {INTERVALS.map((intervalOption) => (
            <option key={intervalOption.value} value={intervalOption.value}>
              {intervalOption.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

function resolveBaseAsset(symbolOption: { value: string; label: string }) {
  const labelBase = symbolOption.label.split('/')[0];

  if (labelBase) {
    return labelBase.toUpperCase();
  }

  return symbolOption.value.replace(/USDT$/i, '').slice(0, 6).toUpperCase();
}
