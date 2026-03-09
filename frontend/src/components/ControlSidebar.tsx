import React from 'react';

const PRIMARY_MODULES = [
  { label: '总览', status: 'live' },
  { label: '行情', status: 'live' },
  { label: '执行', status: 'standby' },
  { label: '策略', status: 'planned' },
  { label: '风控', status: 'planned' },
  { label: '回测', status: 'planned' },
];

const SUPPORT_MODULES = [
  '自动化',
  '研究',
  '日志',
  '设置',
];

export const ControlSidebar: React.FC = () => {
  return (
    <aside className="control-sidebar">
      <div className="control-sidebar__brand">
        <span className="control-sidebar__eyebrow">量化系统栈</span>
        <strong className="control-sidebar__title">Northline</strong>
        <p className="control-sidebar__subtitle">
          面向行情、执行、策略与风控的一体化量化控制室。
        </p>
      </div>

      <nav className="control-sidebar__nav" aria-label="Primary navigation">
        {PRIMARY_MODULES.map((module) => (
          <button key={module.label} className="nav-chip" type="button">
            <span className="nav-chip__label">{module.label}</span>
            <span className={`nav-chip__status nav-chip__status--${module.status}`}>
              {module.status}
            </span>
          </button>
        ))}
      </nav>

      <section className="control-sidebar__section">
        <span className="control-sidebar__section-label">运行栈</span>
        <div className="control-sidebar__list">
          {SUPPORT_MODULES.map((item) => (
            <div key={item} className="control-sidebar__list-item">
              <span>{item}</span>
              <span className="control-sidebar__list-tag">就绪</span>
            </div>
          ))}
        </div>
      </section>

      <section className="control-sidebar__section control-sidebar__section--footer">
        <span className="control-sidebar__section-label">系统姿态</span>
        <div className="signal-stack">
          <div className="signal-stack__item">
            <span>行情链路</span>
            <strong>主通道</strong>
          </div>
          <div className="signal-stack__item">
            <span>风控模式</span>
            <strong>观察态</strong>
          </div>
          <div className="signal-stack__item">
            <span>执行层</span>
            <strong>未启用</strong>
          </div>
        </div>
      </section>
    </aside>
  );
};
