import React from 'react';
import { useMarketStore } from '../stores/marketStore';

export const PriceBoard: React.FC = () => {
  const { latestPrice, exchange, symbol, isConnected } = useMarketStore();

  // 计算涨跌（需要昨天的收盘价，这里简化处理）
  const getPriceChange = () => {
    if (!latestPrice) return { change: 0, percent: 0 };
    // 简化：假设昨日收盘价为当前价格的 98-102% 之间
    const yesterdayClose = latestPrice * 0.995;
    const change = latestPrice - yesterdayClose;
    const percent = (change / yesterdayClose) * 100;
    return { change, percent };
  };

  const { change, percent } = getPriceChange();
  const isUp = change >= 0;

  return (
    <div style={styles.container}>
      <div style={styles.priceRow}>
        <span style={styles.label}>最新价格</span>
        <span
          style={{
            ...styles.price,
            color: isUp ? '#26a69a' : '#ef5350',
          }}
          data-testid="latest-price"
        >
          ${latestPrice?.toFixed(2) || '---'}
        </span>
      </div>

      <div style={styles.changeRow}>
        <span
          style={{
            ...styles.change,
            color: isUp ? '#26a69a' : '#ef5350',
          }}
        >
          {change >= 0 ? '+' : ''}{change.toFixed(2)} ({percent.toFixed(2)}%)
        </span>
      </div>

      <div style={styles.statusRow}>
        <span style={styles.statusLabel}>连接状态</span>
        <span
          style={{
            ...styles.status,
            color: isConnected ? '#26a69a' : '#ef5350',
          }}
        >
          {isConnected ? '● 已连接' : '○ 未连接'}
        </span>
      </div>

      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>交易所</span>
        <span style={styles.infoValue}>{exchange.toUpperCase()}</span>
      </div>

      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>交易对</span>
        <span style={styles.infoValue}>{symbol}</span>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '16px',
    backgroundColor: '#1e222d',
    borderBottom: '1px solid #2a2e39',
  },
  priceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '8px',
  },
  label: {
    fontSize: '12px',
    color: '#787b86',
  },
  price: {
    fontSize: '24px',
    fontWeight: 700,
  },
  changeRow: {
    textAlign: 'right',
    marginBottom: '12px',
  },
  change: {
    fontSize: '14px',
    fontWeight: 500,
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderTop: '1px solid #2a2e39',
  },
  statusLabel: {
    fontSize: '12px',
    color: '#787b86',
  },
  status: {
    fontSize: '12px',
    fontWeight: 500,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  infoLabel: {
    fontSize: '12px',
    color: '#787b86',
  },
  infoValue: {
    fontSize: '12px',
    color: '#d1d4dc',
  },
};
