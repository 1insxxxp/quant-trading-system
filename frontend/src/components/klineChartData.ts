import type { CandlestickData } from 'lightweight-charts';
import type { Kline } from '../types';

export type ChartUpdateMode = 'replace' | 'update-last' | 'append' | 'prepend' | 'repair';
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
    let hasChangesOnlyInLastPoint = true;
    for (let index = 0; index < previousData.length - 1; index += 1) {
      if (!isSameCandlestickPoint(previousData[index], nextData[index])) {
        hasChangesOnlyInLastPoint = false;
        break;
      }
    }
    if (hasChangesOnlyInLastPoint) {
      return 'update-last';
    }
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

  if (
    previousData[0]?.time === nextData[0]?.time &&
    previousLast.time === nextLast.time
  ) {
    return 'repair';
  }

  if (
    previousData[0]?.time === nextData[0]?.time &&
    nextData.length > previousData.length &&
    containsTimeSequence(nextData, previousData)
  ) {
    return 'repair';
  }

  return 'replace';
}

export function shouldLoadOlderKlines(params: {
  visibleFrom: number | null | undefined;
  isLoadingOlderKlines: boolean;
  hasMoreHistoricalKlines: boolean;
  isHistoryPagingReady: boolean;
  hasOlderLoadError: boolean;
}): boolean {
  const {
    visibleFrom,
    isLoadingOlderKlines,
    hasMoreHistoricalKlines,
    isHistoryPagingReady,
    hasOlderLoadError,
  } = params;

  if (isLoadingOlderKlines || !hasMoreHistoricalKlines || !isHistoryPagingReady || hasOlderLoadError) {
    return false;
  }

  if (typeof visibleFrom !== 'number') {
    return false;
  }

  return visibleFrom <= HISTORY_LOAD_EDGE_THRESHOLD;
}

function containsTimeSequence(
  haystack: CandlestickData[],
  needle: CandlestickData[],
): boolean {
  if (needle.length === 0) {
    return true;
  }

  let cursor = 0;

  for (const point of haystack) {
    if (point.time !== needle[cursor]?.time) {
      continue;
    }

    cursor += 1;

    if (cursor === needle.length) {
      return true;
    }
  }

  return false;
}

function isSameCandlestickPoint(
  left: CandlestickData | undefined,
  right: CandlestickData | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.time === right.time &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close
  );
}
