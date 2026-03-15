import type { Kline } from '../types';

export interface KlineValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 校验单条 K 线数据的有效性（前端版本）
 */
export function validateKline(kline: Kline): KlineValidationResult {
  const errors: string[] = [];

  // 1. 检查价格是否为正数
  if (kline.open <= 0 || !Number.isFinite(kline.open)) {
    errors.push(`Invalid open price: ${kline.open}`);
  }
  if (kline.high <= 0 || !Number.isFinite(kline.high)) {
    errors.push(`Invalid high price: ${kline.high}`);
  }
  if (kline.low <= 0 || !Number.isFinite(kline.low)) {
    errors.push(`Invalid low price: ${kline.low}`);
  }
  if (kline.close <= 0 || !Number.isFinite(kline.close)) {
    errors.push(`Invalid close price: ${kline.close}`);
  }

  // 2. 检查最高价 >= 开盘价和收盘价
  if (kline.high < kline.open) {
    errors.push(`High (${kline.high}) < Open (${kline.open})`);
  }
  if (kline.high < kline.close) {
    errors.push(`High (${kline.high}) < Close (${kline.close})`);
  }

  // 3. 检查最低价 <= 开盘价和收盘价
  if (kline.low > kline.open) {
    errors.push(`Low (${kline.low}) > Open (${kline.open})`);
  }
  if (kline.low > kline.close) {
    errors.push(`Low (${kline.low}) > Close (${kline.close})`);
  }

  // 4. 检查最高价 >= 最低价
  if (kline.high < kline.low) {
    errors.push(`High (${kline.high}) < Low (${kline.low})`);
  }

  // 5. 检查成交量为非负数
  if (kline.volume < 0 || !Number.isFinite(kline.volume)) {
    errors.push(`Invalid volume: ${kline.volume}`);
  }
  if (kline.quote_volume < 0 || !Number.isFinite(kline.quote_volume)) {
    errors.push(`Invalid quote volume: ${kline.quote_volume}`);
  }

  // 6. 检查时间戳合理性
  const now = Date.now();
  const maxFutureTime = 5 * 60 * 1000;
  const maxPastTime = 10 * 365 * 24 * 60 * 60 * 1000;

  if (kline.open_time > now + maxFutureTime) {
    errors.push(`Open time is too far in the future`);
  }
  if (kline.open_time < now - maxPastTime) {
    errors.push(`Open time is too far in the past`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 批量校验并过滤无效 K 线
 */
export function filterValidKlines(klines: Kline[]): Kline[] {
  const validKlines: Kline[] = [];

  for (const kline of klines) {
    const result = validateKline(kline);
    if (result.valid) {
      validKlines.push(kline);
    } else {
      console.warn('Invalid kline filtered:', {
        symbol: kline.symbol,
        exchange: kline.exchange,
        open_time: kline.open_time,
        errors: result.errors,
      });
    }
  }

  return validKlines;
}

/**
 * 校验并合并实时 K 线更新
 */
export function mergeRealtimeKline(existing: Kline, incoming: Kline): Kline | null {
  // 首先校验 incoming 数据
  const result = validateKline(incoming);
  if (!result.valid) {
    console.warn('Rejecting invalid realtime kline update:', result.errors);
    return null;
  }

  // 合并逻辑：保留正确的 OHLC 值
  return {
    ...incoming,
    open: existing.open,
    high: Math.max(existing.high, incoming.high),
    low: Math.min(existing.low, incoming.low),
    volume: Math.max(existing.volume, incoming.volume),
    quote_volume: Math.max(existing.quote_volume, incoming.quote_volume),
    trades_count: typeof incoming.trades_count === 'number'
      ? Math.max(existing.trades_count ?? 0, incoming.trades_count ?? 0)
      : existing.trades_count,
  };
}
