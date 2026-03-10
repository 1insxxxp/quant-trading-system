import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getNextEnabledOptionIndex, MarketSelect } from './MarketSelect';

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
});
