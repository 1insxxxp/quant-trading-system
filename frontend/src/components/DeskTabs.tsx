import React from 'react';

const DESK_PANELS = [
  {
    title: '委托',
    status: '规划中',
    body: '这里将承载执行指令、下单队列与成交回报。',
  },
  {
    title: '持仓',
    status: '待命',
    body: '这里将展示组合切片、敞口分层与仓位变化。',
  },
  {
    title: '策略',
    status: '规划中',
    body: '这里预留给模型运行态、健康检查与部署动作。',
  },
];

export const DeskTabs: React.FC = () => {
  return (
    <section className="desk-tabs">
      <div className="desk-tabs__header">
        <div>
          <p className="desk-tabs__eyebrow">工作流带</p>
          <h2 className="desk-tabs__title">执行、持仓与策略通道</h2>
        </div>
        <span className="desk-tabs__badge">外壳已就绪</span>
      </div>

      <div className="desk-tabs__grid">
        {DESK_PANELS.map((panel) => (
          <article key={panel.title} className="desk-panel">
            <div className="desk-panel__header">
              <strong>{panel.title}</strong>
              <span>{panel.status}</span>
            </div>
            <p>{panel.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
