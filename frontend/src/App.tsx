import React from 'react';
import { Toolbar } from './components/Toolbar';
import { KlineChart } from './components/KlineChart';
import { PriceBoard } from './components/PriceBoard';
import { useWebSocket } from './hooks/useWebSocket';
import { getMarketKey, useMarketStore } from './stores/marketStore';

const App: React.FC = () => {
  // 初始化 WebSocket 连接
  useWebSocket();
  const { exchange, symbol, interval } = useMarketStore();
  const marketKey = getMarketKey(exchange, symbol, interval);

  return (
    <div style={styles.app}>
      <Toolbar />
      <PriceBoard />
      <KlineChart key={marketKey} />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1e222d',
    color: '#d1d4dc',
  },
};

export default App;
