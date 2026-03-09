import React, { useEffect } from 'react';
import { useMarketStore } from '../stores/marketStore';

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

  return (
    <div className="toolbar-inline toolbar-inline--terminal">
      <div className="toolbar-field toolbar-field--terminal">
        <label className="toolbar-label" htmlFor="exchange-select">交易所</label>
        <select
          id="exchange-select"
          value={exchange}
          onChange={(event) => setExchange(event.target.value)}
          className="toolbar-select toolbar-select--terminal"
          data-testid="exchange-select"
        >
          {EXCHANGES.map((exchangeOption) => (
            <option key={exchangeOption.value} value={exchangeOption.value}>
              {exchangeOption.label}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-field toolbar-field--terminal">
        <label className="toolbar-label" htmlFor="symbol-select">交易对</label>
        <select
          id="symbol-select"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          className="toolbar-select toolbar-select--terminal"
          data-testid="symbol-select"
          disabled={symbolOptions.length === 0 || symbolOptions[0].value === ''}
        >
          {symbolOptions.map((symbolOption) => (
            <option key={symbolOption.value || 'empty'} value={symbolOption.value}>
              {symbolOption.label}
            </option>
          ))}
        </select>
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
