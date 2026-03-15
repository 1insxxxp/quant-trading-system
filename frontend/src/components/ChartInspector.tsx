import React from 'react';
import type { FundingRate } from '../types';

export interface ChartInspectorSnapshot {
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  percent: number;
}

interface ChartInspectorProps {
  marketLabel: string;
  snapshot: ChartInspectorSnapshot | null;
  fundingRate?: FundingRate | null;
  isLoadingFundingRate?: boolean;
}

function formatValue(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedValue(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatValue(value)}`;
}

function resolveDirection(change: number): 'up' | 'down' | 'flat' {
  if (change > 0) {
    return 'up';
  }

  if (change < 0) {
    return 'down';
  }

  return 'flat';
}

function renderMetric(params: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
  wide?: boolean;
}) {
  const { label, value, tone = 'flat', wide = false } = params;

  return (
    <span className={`chart-inspector__metric${wide ? ' chart-inspector__metric--wide' : ''}`}>
      <span className="chart-inspector__metric-label">{label}</span>
      <span className={`chart-inspector__metric-value chart-inspector__metric-value--${tone}`}>{value}</span>
    </span>
  );
}

function formatFundingRate(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(4)}%`;
}

function formatFundingTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = timestamp - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffMins < 60) {
    return `${diffMins} 分钟后`;
  } else if (diffHours < 24) {
    return `${diffHours} 小时后`;
  } else {
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export const ChartInspector: React.FC<ChartInspectorProps> = ({ marketLabel, snapshot, fundingRate, isLoadingFundingRate }) => {
  if (!snapshot) {
    return (
      <aside className="chart-inspector">
        <strong className="chart-inspector__market">{marketLabel}</strong>
        <strong className="chart-inspector__empty">等待 K 线数据</strong>
      </aside>
    );
  }

  const direction = resolveDirection(snapshot.change);

  return (
    <aside className={`chart-inspector chart-inspector--${direction}`}>
      <strong className="chart-inspector__market">{marketLabel}</strong>
      <div className="chart-inspector__metrics">
        {renderMetric({ label: '开', value: formatValue(snapshot.open), tone: direction })}
        {renderMetric({ label: '高', value: formatValue(snapshot.high), tone: direction })}
        {renderMetric({ label: '低', value: formatValue(snapshot.low), tone: direction })}
        {renderMetric({ label: '收', value: formatValue(snapshot.close), tone: direction })}
        {renderMetric({
          label: '涨跌',
          value: `${formatSignedValue(snapshot.change)} (${snapshot.percent >= 0 ? '+' : ''}${snapshot.percent.toFixed(2)}%)`,
          tone: direction,
          wide: true,
        })}
        {fundingRate ? (
          <span className="chart-inspector__funding-rate">
            <span className="chart-inspector__funding-rate-label">资金费率</span>
            <span className={`chart-inspector__funding-rate-value chart-inspector__funding-rate-value--${fundingRate.fundingRate >= 0 ? 'up' : 'down'}`}>
              {formatFundingRate(fundingRate.fundingRate)}
            </span>
            {fundingRate.nextFundingTimestamp && (
              <span className="chart-inspector__funding-time">
                下次：{formatFundingTime(fundingRate.nextFundingTimestamp)}
              </span>
            )}
          </span>
        ) : isLoadingFundingRate ? (
          <span className="chart-inspector__funding-rate">
            <span className="chart-inspector__funding-rate-label">资金费率</span>
            <span className="chart-inspector__funding-rate-value">加载中...</span>
          </span>
        ) : null}
      </div>
    </aside>
  );
};
