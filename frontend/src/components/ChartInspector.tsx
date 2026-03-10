import React from 'react';

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

export const ChartInspector: React.FC<ChartInspectorProps> = ({ marketLabel, snapshot }) => {
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
        {renderMetric({
          label: '收',
          value: formatValue(snapshot.close),
          tone: direction,
        })}
        {renderMetric({
          label: '涨跌',
          value: `${formatSignedValue(snapshot.change)} (${snapshot.percent >= 0 ? '+' : ''}${snapshot.percent.toFixed(2)}%)`,
          tone: direction,
          wide: true,
        })}
      </div>
    </aside>
  );
};
