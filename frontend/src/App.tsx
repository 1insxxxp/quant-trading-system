import React from 'react';
import { Toolbar } from './components/Toolbar';
import { KlineChart } from './components/KlineChart';
import { PriceBoard } from './components/PriceBoard';
import { useWebSocket } from './hooks/useWebSocket';

const App: React.FC = () => {
  // 初始化 WebSocket 连接
  useWebSocket();

  return (
    <div style={styles.app}>
      <Toolbar />
      <PriceBoard />
      <KlineChart />
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
