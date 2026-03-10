import { describe, expect, it } from 'vitest';
import { formatChartCrosshairTime, formatChartIntervalLabel } from './chartTimeFormat';

describe('chartTimeFormat', () => {
  it('formats interval labels in Chinese for the chart hud', () => {
    expect(formatChartIntervalLabel('5m')).toBe('5分钟');
    expect(formatChartIntervalLabel('1h')).toBe('1小时');
  });

  it('formats crosshair timestamps as localized Chinese labels', () => {
    expect(formatChartCrosshairTime(1_741_658_400_000)).toBe('周二 2025-03-11 10:00');
  });
});
