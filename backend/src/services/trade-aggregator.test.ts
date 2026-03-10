import { describe, expect, it } from 'vitest';
import { TradeAggregator } from './trade-aggregator.js';
import type { Kline, TradeTick } from '../types/index.js';

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

function makeSeedKline(overrides: Partial<Kline> = {}): Kline {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    open_time: 60_000,
    close_time: 119_999,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 3,
    quote_volume: 300,
    trades_count: 3,
    is_closed: 1,
    ...overrides,
  };
}

describe('TradeAggregator', () => {
  it('tracks dirty latest price independently from dirty candle state', () => {
    const aggregator = new TradeAggregator('binance', 'BTCUSDT');

    aggregator.ensureInterval('1m');
    aggregator.addTrade(makeTrade({ price: 101, timestamp: 61_000 }));

    expect(aggregator.consumeDirtyPrice()).toEqual({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      price: 101,
      timestamp: 61_000,
    });
    expect(aggregator.consumeDirtyPrice()).toBeNull();

    const emitted = aggregator.consumeDirtyKlines();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      interval: '1m',
      close: 101,
    });
  });

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

  it('fills missing intervals with flat zero-volume candles before opening the next candle', () => {
    const aggregator = new TradeAggregator('binance', 'BTCUSDT');

    aggregator.ensureInterval('1m', makeSeedKline());
    aggregator.addTrade(makeTrade({ price: 105, quantity: 2, quote_volume: 210, timestamp: 240_000 }));

    const emitted = aggregator.consumeDirtyKlines().filter((item) => item.interval === '1m');

    expect(emitted).toHaveLength(3);
    expect(emitted[0]).toMatchObject({
      open_time: 120_000,
      close: 100,
      volume: 0,
      quote_volume: 0,
      trades_count: 0,
      is_closed: 1,
    });
    expect(emitted[1]).toMatchObject({
      open_time: 180_000,
      close: 100,
      volume: 0,
      quote_volume: 0,
      trades_count: 0,
      is_closed: 1,
    });
    expect(emitted[2]).toMatchObject({
      open_time: 240_000,
      open: 105,
      close: 105,
      volume: 2,
      is_closed: 0,
    });
  });
});
