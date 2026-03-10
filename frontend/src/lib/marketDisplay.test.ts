import { describe, expect, it } from 'vitest';
import { formatDocumentTitle } from './marketDisplay';

describe('marketDisplay', () => {
  it('formats the browser title with live price and market', () => {
    expect(formatDocumentTitle({
      exchange: 'binance',
      symbol: 'ETHUSDT',
      latestPrice: 2022.71,
    })).toBe('$2,022.71 ETH/USDT · BINANCE');
  });

  it('falls back to market-only title when no live price is available', () => {
    expect(formatDocumentTitle({
      exchange: 'okx',
      symbol: 'BTC-USDT',
      latestPrice: null,
    })).toBe('BTC/USDT · OKX - 实时行情');
  });
});
