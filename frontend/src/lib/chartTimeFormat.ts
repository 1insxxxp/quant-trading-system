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
    return `${amount}\u5206\u949f`;
  }

  if (normalizedUnit === 'h') {
    return `${amount}\u5c0f\u65f6`;
  }

  if (normalizedUnit === 'd') {
    return `${amount}\u65e5`;
  }

  if (normalizedUnit === 'w') {
    return `${amount}\u5468`;
  }

  return interval;
}

export function resolveChartIntervalMs(interval: string): number | null {
  const matched = interval.match(/^(\d+)([mhdw])$/i);

  if (!matched) {
    return null;
  }

  const [, amount, unit] = matched;
  const size = Number(amount);

  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit === 'm') {
    return size * 60_000;
  }

  if (normalizedUnit === 'h') {
    return size * 3_600_000;
  }

  if (normalizedUnit === 'd') {
    return size * 86_400_000;
  }

  if (normalizedUnit === 'w') {
    return size * 604_800_000;
  }

  return null;
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

export function formatChartCountdown(remainingMs: number): string {
  const safeRemainingMs = Math.max(0, remainingMs);
  const totalSeconds = Math.ceil(safeRemainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function resolveCurrentCandleCountdownLabel(params: {
  interval: string;
  latestKline: Pick<{ open_time: number; close_time: number }, 'open_time' | 'close_time'> | null;
  now?: number;
}): string | null {
  const {
    interval,
    latestKline,
    now = Date.now(),
  } = params;

  if (!latestKline) {
    return null;
  }

  const inferredDuration = (latestKline.close_time - latestKline.open_time) + 1;
  const intervalDuration = resolveChartIntervalMs(interval);
  const durationMs = inferredDuration > 0 ? inferredDuration : intervalDuration;

  if (!durationMs || durationMs <= 0) {
    return null;
  }

  let periodEndExclusive = latestKline.close_time + 1;

  if (periodEndExclusive <= latestKline.open_time) {
    periodEndExclusive = latestKline.open_time + durationMs;
  }

  while (periodEndExclusive <= now) {
    periodEndExclusive += durationMs;
  }

  return formatChartCountdown(periodEndExclusive - now);
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
