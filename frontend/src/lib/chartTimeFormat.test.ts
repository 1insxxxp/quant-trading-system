import { describe, expect, it } from 'vitest';
import { formatChartCrosshairTime, formatChartIntervalLabel } from './chartTimeFormat';

describe('chartTimeFormat', () => {
  it('formats interval labels in Chinese for the chart hud', () => {
    expect(formatChartIntervalLabel('5m')).toBe('5\u5206\u949f');
    expect(formatChartIntervalLabel('1h')).toBe('1\u5c0f\u65f6');
  });

  it('formats crosshair timestamps as localized Chinese labels', () => {
    expect(formatChartCrosshairTime(1_741_658_400_000)).toBe('\u5468\u4e8c 2025-03-11 10:00');
  });
});

