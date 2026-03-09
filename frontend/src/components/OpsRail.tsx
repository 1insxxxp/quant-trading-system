import React from 'react';
import { useMarketStore } from '../stores/marketStore';

const EVENT_LOG = [
  { time: '09:28:14', label: '信号总线已上线', tone: 'live' },
  { time: '09:28:16', label: '策略注册表待命', tone: 'neutral' },
  { time: '09:28:21', label: '风控阈值已同步', tone: 'neutral' },
  { time: '09:28:31', label: '执行层当前未启用', tone: 'warning' },
];

export const OpsRail: React.FC = () => {
  const { latestPrice, klines, isConnected } = useMarketStore();
  const lastCandle = klines[klines.length - 1];

  return (
    <aside className="ops-rail">
      <section className="rail-card">
        <div className="rail-card__header">
          <span className="rail-card__eyebrow">策略观察</span>
          <span className="rail-card__tag rail-card__tag--planned">规划中</span>
        </div>
        <h3 className="rail-card__title">部署队列</h3>
        <div className="status-grid">
          <div className="status-grid__item">
            <span>活跃模型</span>
            <strong>0</strong>
          </div>
          <div className="status-grid__item">
            <span>模拟会话</span>
            <strong>2</strong>
          </div>
          <div className="status-grid__item">
            <span>审核状态</span>
            <strong>待命</strong>
          </div>
          <div className="status-grid__item">
            <span>下一接入点</span>
            <strong>执行 API</strong>
          </div>
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__header">
          <span className="rail-card__eyebrow">风控姿态</span>
          <span className={`rail-card__tag rail-card__tag--${isConnected ? 'live' : 'warning'}`}>
            {isConnected ? '稳定' : '降级'}
          </span>
        </div>
        <h3 className="rail-card__title">风险护栏</h3>
        <div className="ladder">
          <div className="ladder__row">
            <span>行情连续性</span>
            <strong>{isConnected ? '正常' : '监控中'}</strong>
          </div>
          <div className="ladder__row">
            <span>最大回撤闸门</span>
            <strong>未启用</strong>
          </div>
          <div className="ladder__row">
            <span>下单节流</span>
            <strong>空闲</strong>
          </div>
          <div className="ladder__row">
            <span>风险敞口</span>
            <strong>0%</strong>
          </div>
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__header">
          <span className="rail-card__eyebrow">实时带</span>
          <span className="rail-card__tag rail-card__tag--live">行情</span>
        </div>
        <h3 className="rail-card__title">当前 K 线</h3>
        <div className="status-grid status-grid--compact">
          <div className="status-grid__item">
            <span>最新价</span>
            <strong>{latestPrice ? latestPrice.toFixed(2) : '--'}</strong>
          </div>
          <div className="status-grid__item">
            <span>最高</span>
            <strong>{lastCandle ? lastCandle.high.toFixed(2) : '--'}</strong>
          </div>
          <div className="status-grid__item">
            <span>最低</span>
            <strong>{lastCandle ? lastCandle.low.toFixed(2) : '--'}</strong>
          </div>
          <div className="status-grid__item">
            <span>成交量</span>
            <strong>{lastCandle ? lastCandle.volume.toFixed(3) : '--'}</strong>
          </div>
        </div>
      </section>

      <section className="rail-card rail-card--tape">
        <div className="rail-card__header">
          <span className="rail-card__eyebrow">事件带</span>
          <span className="rail-card__tag rail-card__tag--neutral">运维</span>
        </div>
        <div className="event-tape">
          {EVENT_LOG.map((event) => (
            <div key={`${event.time}-${event.label}`} className="event-tape__item">
              <span className="event-tape__time">{event.time}</span>
              <span className={`event-tape__dot event-tape__dot--${event.tone}`} />
              <span className="event-tape__label">{event.label}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
};
