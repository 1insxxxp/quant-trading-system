import React from 'react';

type NavItem = {
  label: string;
  status: 'active' | 'planned';
};

const NAV_ITEMS: NavItem[] = [
  { label: '行情中心', status: 'active' },
  { label: '交易执行', status: 'planned' },
  { label: '策略管理', status: 'planned' },
  { label: '风控中心', status: 'planned' },
  { label: '回测分析', status: 'planned' },
  { label: '系统日志', status: 'planned' },
];

export const AdminSidebar: React.FC = () => (
  <aside className="admin-sidebar">
    <div className="admin-sidebar__brand">
      <p className="admin-sidebar__eyebrow">量化平台</p>
      <strong className="admin-sidebar__title">交易后台</strong>
      <span className="admin-sidebar__subtitle">Market Workspace</span>
    </div>

    <div className="admin-sidebar__section">
      <p className="admin-sidebar__label">导航菜单</p>
      <nav className="admin-sidebar__nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`admin-nav-item admin-nav-item--${item.status}`}
            disabled={item.status !== 'active'}
          >
            <span>{item.label}</span>
            <em>{item.status === 'active' ? '当前' : '筹备中'}</em>
          </button>
        ))}
      </nav>
    </div>
  </aside>
);
