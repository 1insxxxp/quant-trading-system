import { describe, expect, it, vi } from 'vitest';
import {
  buildChartViewStateKey,
  canRestoreChartVisibleRange,
  readChartVisibleRange,
  writeChartVisibleRange,
} from './chartViewState';

function createStorage(initialValues?: Record<string, string>) {
  const store = new Map(Object.entries(initialValues ?? {}));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe('chartViewState', () => {
  it('builds a stable storage key for a market scope', () => {
    expect(buildChartViewStateKey('binance', 'ETHUSDT', '1h')).toBe(
      'quant-chart-range:binance:ETHUSDT:1h',
    );
  });

  it('stores and restores a visible time range', () => {
    const storage = createStorage();
    const key = buildChartViewStateKey('binance', 'ETHUSDT', '1h');

    writeChartVisibleRange(key, { from: 1_741_536_000, to: 1_741_539_600 }, storage);

    expect(readChartVisibleRange(key, storage)).toEqual({
      from: 1_741_536_000,
      to: 1_741_539_600,
    });
  });

  it('returns null when stored range json is malformed', () => {
    const storage = createStorage({
      'quant-chart-range:binance:ETHUSDT:1h': '{bad json',
    });

    expect(readChartVisibleRange('quant-chart-range:binance:ETHUSDT:1h', storage)).toBeNull();
  });

  it('restores only ranges that overlap the currently loaded time span', () => {
    expect(
      canRestoreChartVisibleRange(
        { from: 1_741_536_000, to: 1_741_539_600 },
        { firstTime: 1_741_536_000, lastTime: 1_741_542_000 },
      ),
    ).toBe(true);

    expect(
      canRestoreChartVisibleRange(
        { from: 1_741_500_000, to: 1_741_510_000 },
        { firstTime: 1_741_536_000, lastTime: 1_741_542_000 },
      ),
    ).toBe(false);
  });
});
