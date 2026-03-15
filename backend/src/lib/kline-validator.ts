import type { Kline } from '../types/index.js';

export interface KlineValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 校验单条 K 线数据的有效性
 *
 * 校验规则：
 * 1. 价格字段必须为正数
 * 2. 最高价 >= 开盘价、收盘价、最低价
 * 3. 最低价 <= 开盘价、收盘价、最高价
 * 4. 成交量必须为非负数
 * 5. 时间戳必须合理（不过期或未来）
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
  const maxFutureTime = 5 * 60 * 1000; // 允许 5 分钟的未来时间（时钟偏差）
  const maxPastTime = 10 * 365 * 24 * 60 * 60 * 1000; // 10 年前

  if (kline.open_time > now + maxFutureTime) {
    errors.push(`Open time (${kline.open_time}) is too far in the future`);
  }
  if (kline.open_time < now - maxPastTime) {
    errors.push(`Open time (${kline.open_time}) is too far in the past`);
  }

  // 7. 检查收盘价 <= 最高价且 >= 最低价（针对未闭合 K 线）
  if (kline.is_closed === 1) {
    if (kline.close > kline.high) {
      errors.push(`Closed: Close (${kline.close}) > High (${kline.high})`);
    }
    if (kline.close < kline.low) {
      errors.push(`Closed: Close (${kline.close}) < Low (${kline.low})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 批量校验 K 线数据，过滤无效数据
 *
 * @param klines - K 线数组
 * @param options - 校验选项
 * @returns 校验后的 K 线数组和统计信息
 */
export function validateKlines(
  klines: Kline[],
  options: {
    strict?: boolean;
    onInvalid?: (kline: Kline, errors: string[]) => void;
  } = {},
): { klines: Kline[]; validCount: number; invalidCount: number; total: number } {
  const { strict = false, onInvalid } = options;
  const validKlines: Kline[] = [];
  let invalidCount = 0;

  for (const kline of klines) {
    const result = validateKline(kline);

    if (result.valid) {
      validKlines.push(kline);
    } else {
      invalidCount++;

      if (strict) {
        // 严格模式：发现第一个无效数据就抛出错误
        throw new Error(`Invalid kline data: ${result.errors.join(', ')}`);
      }

      if (onInvalid) {
        onInvalid(kline, result.errors);
      } else {
        // 默认记录警告
        console.warn('Invalid kline filtered:', {
          symbol: kline.symbol,
          exchange: kline.exchange,
          open_time: kline.open_time,
          errors: result.errors,
        });
      }
    }
  }

  return {
    klines: validKlines,
    validCount: validKlines.length,
    invalidCount,
    total: klines.length,
  };
}

/**
 * 校验 K 线序列的连续性
 *
 * @param klines - 已排序的 K 线数组（按 open_time 升序）
 * @param interval - 时间周期
 * @returns 校验结果
 */
export function validateKlineSequence(
  klines: Kline[],
  interval: string,
): { valid: boolean; gaps: number[]; duplicates: number[] } {
  const gaps: number[] = [];
  const duplicates: number[] = [];

  const intervalMs = getIntervalMs(interval);

  for (let i = 1; i < klines.length; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];

    // 检查重复
    if (prev.open_time === curr.open_time) {
      duplicates.push(i);
      continue;
    }

    // 检查时间间隔
    const expectedTime = prev.open_time + intervalMs;
    const actualGap = curr.open_time - expectedTime;

    // 允许一个周期的误差
    if (Math.abs(actualGap) > intervalMs * 0.5) {
      gaps.push(i);
    }
  }

  return {
    valid: gaps.length === 0 && duplicates.length === 0,
    gaps,
    duplicates,
  };
}

function getIntervalMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // 默认 1 小时

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}
