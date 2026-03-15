import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getNextEnabledOptionIndex, MarketSelect, type MarketSelectOption } from './MarketSelect';

const SAMPLE_OPTIONS: MarketSelectOption[] = [
  { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
];

describe('MarketSelect', () => {
  it('renders the current option and expanded option list with icons', () => {
    const markup = renderToStaticMarkup(
      <MarketSelect
        label="交易所"
        value="binance"
        onChange={() => undefined}
        initialOpen
        testId="exchange-select"
        options={[
          { value: 'binance', label: 'Binance', icon: <span className="test-icon">B</span> },
          { value: 'okx', label: 'OKX', icon: <span className="test-icon">O</span> },
        ]}
      />,
    );

    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('test-icon');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-testid="exchange-select-trigger"');
  });

  it('finds the next enabled option during keyboard navigation', () => {
    expect(getNextEnabledOptionIndex({
      currentIndex: 0,
      direction: 1,
      options: [
        { value: 'binance', label: 'Binance' },
        { value: 'okx', label: 'OKX', disabled: true },
        { value: 'bybit', label: 'Bybit' },
      ],
    })).toBe(2);

    expect(getNextEnabledOptionIndex({
      currentIndex: 2,
      direction: -1,
      options: [
        { value: 'binance', label: 'Binance' },
        { value: 'okx', label: 'OKX', disabled: true },
        { value: 'bybit', label: 'Bybit' },
      ],
    })).toBe(0);
  });

  describe('search functionality', () => {
    it('renders search input when searchable prop is true', () => {
      const markup = renderToStaticMarkup(
        <MarketSelect
          label="交易对"
          value="BTCUSDT"
          onChange={() => undefined}
          initialOpen
          searchable={true}
          options={SAMPLE_OPTIONS}
        />,
      );

      expect(markup).toContain('market-select__search');
      expect(markup).toContain('market-select__search-input');
      expect(markup).toContain('placeholder="搜索..."');
    });

    it('does not render search input when searchable prop is false', () => {
      const markup = renderToStaticMarkup(
        <MarketSelect
          label="交易对"
          value="BTCUSDT"
          onChange={() => undefined}
          initialOpen
          searchable={false}
          options={SAMPLE_OPTIONS}
        />,
      );

      expect(markup).not.toContain('market-select__search');
    });

    it('uses custom placeholder when provided', () => {
      const markup = renderToStaticMarkup(
        <MarketSelect
          label="交易对"
          value="BTCUSDT"
          onChange={() => undefined}
          initialOpen
          searchable={true}
          placeholder="搜索交易对..."
          options={SAMPLE_OPTIONS}
        />,
      );

      expect(markup).toContain('placeholder="搜索交易对..."');
    });
  });
});
