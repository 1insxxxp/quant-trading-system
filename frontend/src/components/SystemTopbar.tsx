import React from 'react';
import { useUiStore } from '../stores/uiStore';

export const SystemTopbar: React.FC = () => {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <header className="system-topbar">
      <div className="system-topbar__leading">
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
        <strong className="system-topbar__title">后台工作台</strong>
      </div>
    </header>
  );
};
