import React, { useEffect } from 'react';
import { AdminSidebar } from './components/AdminSidebar';
import { KlineChart } from './components/KlineChart';
import { SystemTopbar } from './components/SystemTopbar';
import { useWebSocket } from './hooks/useWebSocket';
import { formatDocumentTitle } from './lib/marketDisplay';
import { useMarketStore } from './stores/marketStore';
import { useUiStore } from './stores/uiStore';

const App: React.FC = () => {
  useWebSocket();
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const exchange = useMarketStore((state) => state.exchange);
  const symbol = useMarketStore((state) => state.symbol);
  const latestPrice = useMarketStore((state) => state.latestPrice);
  const fetchIndicatorSettings = useMarketStore((state) => state.fetchIndicatorSettings);

  useEffect(() => {
    document.title = formatDocumentTitle({ exchange, symbol, latestPrice });
  }, [exchange, symbol, latestPrice]);

  useEffect(() => {
    void fetchIndicatorSettings();
  }, [fetchIndicatorSettings]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div
      className={`admin-shell ${isSidebarCollapsed ? 'admin-shell--sidebar-collapsed' : ''}`}
      data-theme={theme}
    >
      <AdminSidebar />

      <main className="admin-main">
        <SystemTopbar />

        <section className="content-area">
          <KlineChart />
        </section>
      </main>
    </div>
  );
};

export default App;
