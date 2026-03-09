import { describe, expect, it } from 'vitest';
import { TradeAggregator } from './trade-aggregator.js';
import type { TradeTick } from '../types/index.js';

function makeTrade(overrides: Partial<TradeTick> = {}): TradeTick {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    price: 100,
    quantity: 2,
    quote_volume: 200,
    timestamp: 61_000,
    ...overrides,
  };
}

describe('TradeAggregator', () => {
  it('aggregates trades into the active candle for each subscribed interval', () => {
    const aggregator = new TradeAggregator('binance', 'BTCUSDT');

    aggregator.ensureInterval('1m');
    aggregator.ensureInterval('5m');
    aggregator.addTrade(makeTrade({ price: 100, quantity: 2, quote_volume: 200, timestamp: 61_000 }));
    aggregator.addTrade(makeTrade({ price: 104, quantity: 1, quote_volume: 104, timestamp: 89_000 }));

    const emitted = aggregator.consumeDirtyKlines();
    const oneMinute = emitted.find((item) => item.interval === '1m');
    const fiveMinute = emitted.find((item) => item.interval === '5m');

    expect(oneMinute).toMatchObject({
      open_time: 60_000,
      open: 100,
      high: 104,
      low: 100,
      close: 104,
      volume: 3,
      quote_volume: 304,
      is_closed: 0,
    });
    expect(fiveMinute).toMatchObject({
      open_time: 0,
      open: 100,
      high: 104,
      low: 100,
      close: 104,
      volume: 3,
      quote_volume: 304,
      is_closed: 0,
    });
  });

  it('rolls over to a new candle at the interval boundary and emits the closed candle', () => {
    const aggregator = new TradeAggregator('binance', 'BTCUSDT');

    aggregator.ensureInterval('1m');
    aggregator.addTrade(makeTrade({ price: 100, quantity: 1, quote_volume: 100, timestamp: 61_000 }));
    aggregator.consumeDirtyKlines();

    aggregator.addTrade(makeTrade({ price: 103, quantity: 2, quote_volume: 206, timestamp: 121_000 }));

    const emitted = aggregator.consumeDirtyKlines().filter((item) => item.interval === '1m');

    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      open_time: 60_000,
      close: 100,
      volume: 1,
      is_closed: 1,
    });
    expect(emitted[1]).toMatchObject({
      open_time: 120_000,
      open: 103,
      close: 103,
      volume: 2,
      is_closed: 0,
    });
  });

  it('stops emitting candles for intervals that are removed', () => {
    const aggregator = new TradeAggregator('binance', 'BTCUSDT');

    aggregator.ensureInterval('1m');
    aggregator.addTrade(makeTrade());
    aggregator.removeInterval('1m');

    const emitted = aggregator.consumeDirtyKlines();

    expect(emitted).toEqual([]);
  });
});
