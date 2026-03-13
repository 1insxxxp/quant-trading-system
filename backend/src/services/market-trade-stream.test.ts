import { describe, expect, it, vi } from 'vitest';
import { MarketTradeStream } from './market-trade-stream.js';
import type { TradeTick } from '../types/index.js';

function makeTrade(overrides: Partial<TradeTick> = {}): TradeTick {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    price: 100,
    quantity: 1,
    quote_volume: 100,
    timestamp: 61_000,
    ...overrides,
  };
}

describe('MarketTradeStream', () => {
  it('uses one upstream trade subscription for multiple intervals and emits batched price and candle updates on flush', async () => {
    vi.useFakeTimers();

    let onTrade: ((trade: TradeTick) => void) | null = null;
    const subscribeTrades = vi.fn((_symbol: string, callback: (trade: TradeTick) => void) => {
      onTrade = callback;
      return vi.fn();
    });
    const onEmitPrice = vi.fn();
    const onEmitKline = vi.fn();

    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades,
      loadSeedKline: vi.fn(async () => null),
      onEmitPrice,
      onEmitKline,
      setIntervalFn: vi.fn((callback: TimerHandler) => setInterval(callback, 200)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');
    await stream.addInterval('5m');

    expect(subscribeTrades).toHaveBeenCalledTimes(1);

    onTrade?.(makeTrade({ price: 101, quantity: 2, quote_volume: 202 }));
    vi.advanceTimersByTime(400);

    expect(onEmitPrice).toHaveBeenCalledTimes(1);
    expect(onEmitPrice).toHaveBeenCalledWith({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      price: 101,
      timestamp: 61_000,
    });
    expect(onEmitKline).toHaveBeenCalledTimes(2);
    expect(onEmitKline).toHaveBeenCalledWith(expect.objectContaining({ interval: '1m', close: 101 }));
    expect(onEmitKline).toHaveBeenCalledWith(expect.objectContaining({ interval: '5m', close: 101 }));

    vi.advanceTimersByTime(200);
    expect(onEmitPrice).toHaveBeenCalledTimes(1);
    expect(onEmitKline).toHaveBeenCalledTimes(2);

    stream.close();
  });

  it('stops the upstream trade stream after the last interval unsubscribes', async () => {
    vi.useFakeTimers();

    const unsubscribe = vi.fn();
    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades: vi.fn(() => unsubscribe),
      loadSeedKline: vi.fn(async () => null),
      onEmitPrice: vi.fn(),
      onEmitKline: vi.fn(),
      setIntervalFn: vi.fn((callback: TimerHandler) => setInterval(callback, 200)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');
    stream.removeInterval('1m');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('persists closed candles immediately on rollover instead of waiting for the display flush', async () => {
    vi.useFakeTimers();

    let onTrade: ((trade: TradeTick) => void) | null = null;
    const persistClosedKlines = vi.fn(async () => undefined);

    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades: vi.fn((_symbol, callback) => {
        onTrade = callback;
        return vi.fn();
      }),
      loadSeedKline: vi.fn(async () => null),
      onEmitPrice: vi.fn(),
      onEmitKline: vi.fn(),
      persistClosedKlines,
      checkpointOpenKlines: vi.fn(async () => undefined),
      setIntervalFn: vi.fn((callback: TimerHandler, delay?: number) => setInterval(callback, delay)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');

    onTrade?.(makeTrade({ price: 100, timestamp: 61_000 }));
    onTrade?.(makeTrade({ price: 103, timestamp: 121_000 }));

    expect(persistClosedKlines).toHaveBeenCalledTimes(1);
    expect(persistClosedKlines).toHaveBeenCalledWith([
      expect.objectContaining({
        interval: '1m',
        open_time: 60_000,
        close: 100,
        is_closed: 1,
      }),
    ]);
  });

  it('checkpoints open candles on a lower-frequency timer without blocking the display lane', async () => {
    vi.useFakeTimers();

    let onTrade: ((trade: TradeTick) => void) | null = null;
    const checkpointOpenKlines = vi.fn(async () => undefined);
    const onEmitPrice = vi.fn();

    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades: vi.fn((_symbol, callback) => {
        onTrade = callback;
        return vi.fn();
      }),
      loadSeedKline: vi.fn(async () => null),
      onEmitPrice,
      onEmitKline: vi.fn(),
      persistClosedKlines: vi.fn(async () => undefined),
      checkpointOpenKlines,
      setIntervalFn: vi.fn((callback: TimerHandler, delay?: number) => setInterval(callback, delay)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');

    onTrade?.(makeTrade({ price: 102, timestamp: 61_000 }));
    vi.advanceTimersByTime(200);
    expect(onEmitPrice).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4_800);
    expect(checkpointOpenKlines).toHaveBeenCalledTimes(1);
    expect(checkpointOpenKlines).toHaveBeenCalledWith([
      expect.objectContaining({
        interval: '1m',
        open_time: 60_000,
        close: 102,
        is_closed: 0,
      }),
    ]);
  });

  it('replays recovered realtime gap candles before emitting the new active candle', async () => {
    vi.useFakeTimers();

    let onTrade: ((trade: TradeTick) => void) | null = null;
    const onEmitKline = vi.fn();
    const persistClosedKlines = vi.fn(async () => undefined);
    const recoverGapKlines = vi.fn(async () => [
      {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: '1m',
        open_time: 120_000,
        close_time: 179_999,
        open: 101,
        high: 104,
        low: 99,
        close: 103,
        volume: 5,
        quote_volume: 515,
        trades_count: 5,
        is_closed: 1,
      },
    ]);

    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades: vi.fn((_symbol, callback) => {
        onTrade = callback;
        return vi.fn();
      }),
      loadSeedKline: vi.fn(async () => null),
      onEmitPrice: vi.fn(),
      onEmitKline,
      persistClosedKlines,
      checkpointOpenKlines: vi.fn(async () => undefined),
      recoverGapKlines,
      setIntervalFn: vi.fn((callback: TimerHandler, delay?: number) => setInterval(callback, delay)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');

    onTrade?.(makeTrade({ price: 100, timestamp: 61_000 }));
    onTrade?.(makeTrade({ price: 105, timestamp: 240_000, quantity: 2, quote_volume: 210 }));
    await vi.advanceTimersByTimeAsync(400);

    expect(recoverGapKlines).toHaveBeenCalledWith('1m', 60_000, 240_000);
    expect(persistClosedKlines).toHaveBeenCalledWith([
      expect.objectContaining({
        interval: '1m',
        open_time: 60_000,
        close: 100,
        is_closed: 1,
      }),
      expect.objectContaining({
        interval: '1m',
        open_time: 120_000,
        close: 103,
        is_closed: 1,
      }),
    ]);
    expect(onEmitKline).toHaveBeenCalledWith(expect.objectContaining({
      interval: '1m',
      open_time: 240_000,
      close: 105,
      is_closed: 0,
    }));
  });
});
