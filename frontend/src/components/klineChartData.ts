import type { CandlestickData } from 'lightweight-charts';
import type { Kline } from '../types';

export type ChartUpdateMode = 'replace' | 'update-last' | 'append' | 'prepend';
const HISTORY_LOAD_EDGE_THRESHOLD = 50;

export function buildCandlestickData(klines: Kline[]): CandlestickData[] {
  const deduped = new Map<number, Kline>();

  [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .forEach((kline) => {
      deduped.set(kline.open_time, kline);
    });

  return [...deduped.values()].map((kline) => ({
    time: (kline.open_time / 1000) as CandlestickData['time'],
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
  }));
}

export function resolveChartUpdateMode(params: {
  previousData: CandlestickData[];
  nextData: CandlestickData[];
  previousMarketKey: string | null;
  nextMarketKey: string;
}): ChartUpdateMode {
  const {
    previousData,
    nextData,
    previousMarketKey,
    nextMarketKey,
  } = params;

  if (previousMarketKey !== nextMarketKey) {
    return 'replace';
  }

  if (previousData.length === 0 || nextData.length === 0) {
    return 'replace';
  }

  const previousLast = previousData[previousData.length - 1];
  const nextLast = nextData[nextData.length - 1];

  if (!previousLast || !nextLast) {
    return 'replace';
  }

  if (
    previousData.length === nextData.length &&
    previousLast.time === nextLast.time
  ) {
    return 'update-last';
  }

  const prependOffset = nextData.length - previousData.length;
  const nextFirstAligned = prependOffset > 0 ? nextData[prependOffset] : undefined;

  if (
    prependOffset > 0 &&
    nextLast.time === previousLast.time &&
    nextFirstAligned?.time === previousData[0]?.time
  ) {
    return 'prepend';
  }

  const nextPenultimate = nextData[nextData.length - 2];

  if (
    previousData.length + 1 === nextData.length &&
    nextPenultimate?.time === previousLast.time
  ) {
    return 'append';
  }

  return 'replace';
}

export function shouldLoadOlderKlines(params: {
  visibleFrom: number | null | undefined;
  isLoadingOlderKlines: boolean;
  hasMoreHistoricalKlines: boolean;
}): boolean {
  const {
    visibleFrom,
    isLoadingOlderKlines,
    hasMoreHistoricalKlines,
  } = params;

  if (isLoadingOlderKlines || !hasMoreHistoricalKlines) {
    return false;
  }

  if (typeof visibleFrom !== 'number') {
    return false;
  }

  return visibleFrom <= HISTORY_LOAD_EDGE_THRESHOLD;
}
