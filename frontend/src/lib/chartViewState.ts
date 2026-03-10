const CHART_VIEW_STATE_STORAGE_PREFIX = 'quant-chart-range';

export interface ChartVisibleRange {
  from: number;
  to: number;
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function buildChartViewStateKey(exchange: string, symbol: string, interval: string): string {
  return `${CHART_VIEW_STATE_STORAGE_PREFIX}:${exchange}:${symbol}:${interval}`;
}

export function readChartVisibleRange(
  key: string,
  storage: StorageLike | undefined = getSessionStorage(),
): ChartVisibleRange | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ChartVisibleRange>;

    if (!isFiniteNumber(parsed.from) || !isFiniteNumber(parsed.to) || parsed.from >= parsed.to) {
      storage.removeItem(key);
      return null;
    }

    return {
      from: parsed.from,
      to: parsed.to,
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeChartVisibleRange(
  key: string,
  range: ChartVisibleRange | null,
  storage: StorageLike | undefined = getSessionStorage(),
): void {
  if (!storage) {
    return;
  }

  if (!range || !isFiniteNumber(range.from) || !isFiniteNumber(range.to) || range.from >= range.to) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, JSON.stringify(range));
}

export function canRestoreChartVisibleRange(
  range: ChartVisibleRange | null,
  bounds: { firstTime: number; lastTime: number },
): boolean {
  if (!range || !isFiniteNumber(range.from) || !isFiniteNumber(range.to)) {
    return false;
  }

  return !(range.to < bounds.firstTime || range.from > bounds.lastTime);
}

function getSessionStorage(): StorageLike | undefined {
  if (typeof sessionStorage === 'undefined') {
    return undefined;
  }

  return sessionStorage;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
