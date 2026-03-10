import React from 'react';

export interface ChartInspectorSnapshot {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  percent: number;
  volume: number;
  quoteVolume: number;
}

interface ChartInspectorProps {
  marketLabel: string;
  snapshot: ChartInspectorSnapshot | null;
  showVolume: boolean;
}

function formatValue(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderChip(params: { label: string; value: string; accent?: boolean }) {
  const { label, value, accent = false } = params;

  return (
    <span className={`chart-inspector__chip${accent ? ' chart-inspector__chip--accent' : ''}`}>
      <span className="chart-inspector__chip-label">{label}</span>
      <span className="chart-inspector__value">{value}</span>
    </span>
  );
}

export const ChartInspector: React.FC<ChartInspectorProps> = ({
  marketLabel,
  snapshot,
  showVolume,
}) => {
  if (!snapshot) {
    return (
      <aside className="chart-inspector">
        <div className="chart-inspector__headline">
          <strong className="chart-inspector__market">{marketLabel}</strong>
        </div>
        <strong className="chart-inspector__empty">等待 K 线数据</strong>
      </aside>
    );
  }

  return (
    <aside className="chart-inspector">
      <div className="chart-inspector__headline">
        <strong className="chart-inspector__market">{marketLabel}</strong>
        <strong className="chart-inspector__time">{snapshot.timeLabel}</strong>
      </div>
      <div className="chart-inspector__ohlc">
        {renderChip({ label: '开', value: formatValue(snapshot.open) })}
        {renderChip({ label: '高', value: formatValue(snapshot.high) })}
        {renderChip({ label: '低', value: formatValue(snapshot.low) })}
        {renderChip({ label: '收', value: formatValue(snapshot.close) })}
        {renderChip({
          label: '涨跌',
          value: `${snapshot.change >= 0 ? '+' : ''}${formatValue(snapshot.change)} (${snapshot.percent.toFixed(2)}%)`,
          accent: true,
        })}
      </div>
      {showVolume ? (
        <div className="chart-inspector__meta">
          {renderChip({ label: '成交量', value: formatValue(snapshot.volume) })}
          {renderChip({ label: '成交额', value: formatValue(snapshot.quoteVolume) })}
        </div>
      ) : null}
    </aside>
  );
};
