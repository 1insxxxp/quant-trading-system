import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminSidebar } from './components/AdminSidebar';
import { KlineChart } from './components/KlineChart';
import { SystemTopbar } from './components/SystemTopbar';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useWebSocket } from './hooks/useWebSocket';
import { formatDocumentTitle } from './lib/marketDisplay';
import { useMarketStore } from './stores/marketStore';
import { useUiStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';

const MainLayout: React.FC = () => {
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

const App: React.FC = () => {
  const { loadFromStorage, isAuthenticated } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
