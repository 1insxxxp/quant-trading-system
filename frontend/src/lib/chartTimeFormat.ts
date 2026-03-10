import type { Time } from 'lightweight-charts';

const chartCrosshairDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
});

export function formatChartIntervalLabel(interval: string): string {
  const matched = interval.match(/^(\d+)([mhdw])$/i);

  if (!matched) {
    return interval;
  }

  const [, amount, unit] = matched;
  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit === 'm') {
    return `${amount}分钟`;
  }

  if (normalizedUnit === 'h') {
    return `${amount}小时`;
  }

  if (normalizedUnit === 'd') {
    return `${amount}日`;
  }

  if (normalizedUnit === 'w') {
    return `${amount}周`;
  }

  return interval;
}

export function formatChartCrosshairTime(timestamp: number): string {
  const normalized = normalizeTimestamp(timestamp);
  const parts = chartCrosshairDateTimeFormatter.formatToParts(new Date(normalized));
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return `${partMap.get('weekday') ?? ''} ${partMap.get('year') ?? '0000'}-${partMap.get('month') ?? '00'}-${partMap.get('day') ?? '00'} ${partMap.get('hour') ?? '00'}:${partMap.get('minute') ?? '00'}`;
}

export function formatChartVolumeLegendValue(value: number): string {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function resolveTimestampFromChartTime(time: Time): number | null {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return normalizeTimestamp(time);
  }

  if (time && typeof time === 'object' && 'year' in time) {
    return Date.UTC(time.year, time.month - 1, time.day);
  }

  return null;
}

function normalizeTimestamp(timestamp: number): number {
  return timestamp >= 1_000_000_000_000 ? timestamp : timestamp * 1000;
}
