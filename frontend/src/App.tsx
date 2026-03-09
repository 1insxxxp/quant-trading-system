import React from 'react';
import { AdminSidebar } from './components/AdminSidebar';
import { KlineChart } from './components/KlineChart';
import { PriceBoard } from './components/PriceBoard';
import { SystemTopbar } from './components/SystemTopbar';
import { useWebSocket } from './hooks/useWebSocket';
import { useUiStore } from './stores/uiStore';

const App: React.FC = () => {
  useWebSocket();
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);

  return (
    <div className={`admin-shell ${isSidebarCollapsed ? 'admin-shell--sidebar-collapsed' : ''}`}>
      <AdminSidebar />

      <main className="admin-main">
        <SystemTopbar />

        <section className="content-area">
          <PriceBoard />
          <KlineChart />
        </section>
      </main>
    </div>
  );
};

export default App;
