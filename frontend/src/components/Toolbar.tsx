import React from 'react';
import { useMarketStore } from '../stores/marketStore';

const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'okx', label: 'OKX' },
];

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
];

const INTERVALS = [
  { value: '1m', label: '1 分钟' },
  { value: '5m', label: '5 分钟' },
  { value: '15m', label: '15 分钟' },
  { value: '1h', label: '1 小时' },
  { value: '4h', label: '4 小时' },
  { value: '1d', label: '1 天' },
];

export const Toolbar: React.FC = () => {
  const { exchange, symbol, interval, setExchange, setSymbol, setInterval } = useMarketStore();

  return (
    <div style={styles.toolbar}>
      <div style={styles.controlGroup}>
        <label style={styles.label}>交易所</label>
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          style={styles.select}
          data-testid="exchange-select"
        >
          {EXCHANGES.map((ex) => (
            <option key={ex.value} value={ex.value}>
              {ex.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.controlGroup}>
        <label style={styles.label}>交易对</label>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={styles.select}
          data-testid="symbol-select"
        >
          {SYMBOLS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.controlGroup}>
        <label style={styles.label}>周期</label>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          style={styles.select}
          data-testid="interval-select"
        >
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  toolbar: {
    display: 'flex',
    gap: '20px',
    padding: '16px',
    backgroundColor: '#1e222d',
    borderBottom: '1px solid #2a2e39',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    color: '#787b86',
    fontWeight: 500,
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: '#2a2e39',
    color: '#d1d4dc',
    border: '1px solid #363a45',
    borderRadius: '4px',
    cursor: 'pointer',
    minWidth: '120px',
  },
};
