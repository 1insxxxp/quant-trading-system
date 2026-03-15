import type { CandlestickData } from 'lightweight-charts';
import type { Kline } from '../types';

export type ChartUpdateMode = 'replace' | 'update-last' | 'append' | 'prepend' | 'repair';
const HISTORY_LOAD_EDGE_THRESHOLD = 50;
const DETACHED_REALTIME_PRICE_THRESHOLD = 5;
export interface LogicalRange {
  from: number;
  to: number;
}

export function buildCandlestickData(klines: Kline[]): CandlestickData[] {
  const deduped = new Map<number, Kline>();

  [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .forEach((kline) => {
      deduped.set(kline.open_time, kline);
    });

  const normalized = [...deduped.values()];

  if (normalized.length === 0) {
    return [];
  }

  if (normalized.length === 1) {
    return [{
      time: (normalized[0].open_time / 1000) as CandlestickData['time'],
      open: normalized[0].open,
      high: normalized[0].high,
      low: normalized[0].low,
      close: normalized[0].close,
    }];
  }

  const intervalMs = resolveIntervalMs(normalized);

  if (intervalMs <= 0) {
    return normalized.map((kline) => ({
      time: (kline.open_time / 1000) as CandlestickData['time'],
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    }));
  }

  // 对齐到时间网格
  const firstTime = normalized[0].open_time;
  const lastTime = normalized[normalized.length - 1].open_time;

  // 计算理论上的起始时间（向下对齐到 interval 边界）
  const alignedFirstTime = Math.floor(firstTime / intervalMs) * intervalMs;

  // 计算需要的数据点数量
  const expectedCount = Math.floor((lastTime - alignedFirstTime) / intervalMs) + 1;

  // 限制最大填充数量，避免内存问题
  const maxAllowedPoints = normalized.length * 3 + 100;

  // 如果理论数量远大于实际数量，说明间隔计算可能有误，直接返回原始数据
  if (expectedCount > maxAllowedPoints) {
    return normalized.map((kline) => ({
      time: (kline.open_time / 1000) as CandlestickData['time'],
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    }));
  }

  // 创建时间到 K 线的映射
  const timeToKline = new Map<number, Kline>();
  for (const kline of normalized) {
    timeToKline.set(kline.open_time, kline);
  }

  // 生成完整的 K 线序列
  const result: CandlestickData[] = [];
  let prevClose: number | null = null;

  for (let i = 0; i < expectedCount; i++) {
    const targetTime = alignedFirstTime + i * intervalMs;
    const kline = timeToKline.get(targetTime);

    if (kline) {
      result.push({
        time: (targetTime / 1000) as CandlestickData['time'],
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
      });
      prevClose = kline.close;
    } else if (prevClose !== null) {
      // 使用前置收盘价填充缺失的 K 线
      result.push({
        time: (targetTime / 1000) as CandlestickData['time'],
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
      });
    }
  }

  return result;
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

  return isNearHistoryLoadEdge(visibleFrom);
}

export function isNearHistoryLoadEdge(visibleFrom: number | null | undefined): boolean {
  if (typeof visibleFrom !== 'number') {
    return false;
  }

  return visibleFrom <= HISTORY_LOAD_EDGE_THRESHOLD;
}

export function shouldShowDetachedRealtimePriceLine(params: {
  latestPrice: number | null;
  latestLogicalIndex: number | null;
  visibleTo: number | null | undefined;
}): boolean {
  const {
    latestPrice,
    latestLogicalIndex,
    visibleTo,
  } = params;

  if (typeof latestPrice !== 'number' || typeof latestLogicalIndex !== 'number' || typeof visibleTo !== 'number') {
    return false;
  }

  return visibleTo < latestLogicalIndex - DETACHED_REALTIME_PRICE_THRESHOLD;
}

export function resolveVisibleRangeAfterPrepend(params: {
  visibleRange: LogicalRange | null | undefined;
  prependedCount: number;
  keepPinnedToLeftEdge: boolean;
}): LogicalRange | null {
  const {
    visibleRange,
    prependedCount,
  } = params;

  if (!visibleRange) {
    return null;
  }

  return {
    from: visibleRange.from + prependedCount,
    to: visibleRange.to + prependedCount,
  };
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

function resolveIntervalMs(klines: Kline[]): number {
  // 优先从已闭合 K 线的窗口计算间隔
  for (const kline of klines) {
    if (kline.is_closed === 1) {
      const windowMs = kline.close_time - kline.open_time + 1;
      if (windowMs > 0) {
        return windowMs;
      }
    }
  }

  // 如果没有已闭合 K 线，从相邻 K 线的 open_time 差值计算
  for (let index = 1; index < klines.length; index += 1) {
    const gap = klines[index].open_time - klines[index - 1].open_time;
    if (gap > 0) {
      return gap;
    }
  }

  return 0;
}
