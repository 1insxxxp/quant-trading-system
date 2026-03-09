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
  it('uses one upstream trade subscription for multiple intervals and emits aggregated candles on flush', async () => {
    vi.useFakeTimers();

    let onTrade: ((trade: TradeTick) => void) | null = null;
    const subscribeTrades = vi.fn((_symbol: string, callback: (trade: TradeTick) => void) => {
      onTrade = callback;
      return vi.fn();
    });
    const onEmit = vi.fn();

    const stream = new MarketTradeStream({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      subscribeTrades,
      loadSeedKline: vi.fn(async () => null),
      onEmit,
      setIntervalFn: vi.fn((callback: TimerHandler) => setInterval(callback, 1000)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');
    await stream.addInterval('5m');

    expect(subscribeTrades).toHaveBeenCalledTimes(1);

    onTrade?.(makeTrade({ price: 101, quantity: 2, quote_volume: 202 }));
    vi.advanceTimersByTime(1000);

    expect(onEmit).toHaveBeenCalledTimes(2);
    expect(onEmit).toHaveBeenCalledWith(expect.objectContaining({ interval: '1m', close: 101 }));
    expect(onEmit).toHaveBeenCalledWith(expect.objectContaining({ interval: '5m', close: 101 }));

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
      onEmit: vi.fn(),
      setIntervalFn: vi.fn((callback: TimerHandler) => setInterval(callback, 1000)),
      clearIntervalFn: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
    });

    await stream.addInterval('1m');
    stream.removeInterval('1m');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
