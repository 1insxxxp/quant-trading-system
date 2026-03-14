import { describe, expect, it } from 'vitest';
import {
  formatChartCountdown,
  formatChartCrosshairTime,
  formatChartIntervalLabel,
  resolveCurrentCandleCountdownLabel,
  resolveChartIntervalMs,
} from './chartTimeFormat';

describe('chartTimeFormat', () => {
  it('formats interval labels in Chinese for the chart hud', () => {
    expect(formatChartIntervalLabel('5m')).toBe('5\u5206\u949f');
    expect(formatChartIntervalLabel('1h')).toBe('1\u5c0f\u65f6');
  });

  it('formats crosshair timestamps as localized Chinese labels', () => {
    expect(formatChartCrosshairTime(1_741_658_400_000)).toBe('\u5468\u4e8c 2025-03-11 10:00');
  });

  it('resolves interval strings into chart durations', () => {
    expect(resolveChartIntervalMs('1m')).toBe(60_000);
    expect(resolveChartIntervalMs('4h')).toBe(14_400_000);
    expect(resolveChartIntervalMs('1d')).toBe(86_400_000);
    expect(resolveChartIntervalMs('1w')).toBe(604_800_000);
    expect(resolveChartIntervalMs('custom')).toBeNull();
  });

  it('formats countdown labels for sub-hour and multi-hour windows', () => {
    expect(formatChartCountdown(9 * 60_000 + 17_000)).toBe('09:17');
    expect(formatChartCountdown(3 * 3_600_000 + 9 * 60_000 + 17_000)).toBe('03:09:17');
    expect(formatChartCountdown(-1)).toBe('00:00');
  });

  it('derives the active candle countdown from the latest kline window', () => {
    expect(
      resolveCurrentCandleCountdownLabel({
        interval: '1h',
        latestKline: {
          open_time: 1_741_680_000_000,
          close_time: 1_741_683_599_999,
        },
        now: 1_741_682_980_000,
      }),
    ).toBe('10:20');
  });

  it('rolls the countdown into the next inferred interval when the last kline window is stale', () => {
    expect(
      resolveCurrentCandleCountdownLabel({
        interval: '1h',
        latestKline: {
          open_time: 1_741_680_000_000,
          close_time: 1_741_683_599_999,
        },
        now: 1_741_684_100_000,
      }),
    ).toBe('51:40');
  });
});
