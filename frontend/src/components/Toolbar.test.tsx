import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndicatorSettings } from '../types';

const mockMarketState = {
  interval: '1h',
  setInterval: vi.fn(),
};

vi.mock('../stores/marketStore', () => ({
  useMarketStore: (selector?: (state: typeof mockMarketState) => unknown) =>
    typeof selector === 'function' ? selector(mockMarketState) : mockMarketState,
}));

import { Toolbar } from './Toolbar';

const indicatorSettings: IndicatorSettings = {
  volume: false,
  ma5: true,
  ma10: false,
  ma20: false,
};
const onToggleIndicator = vi.fn();

describe('Toolbar', () => {
  beforeEach(() => {
    mockMarketState.interval = '1h';
  });

  it('renders compact interval controls and indicator trigger', () => {
    const markup = renderToStaticMarkup(
      <Toolbar
        indicatorSettings={indicatorSettings}
        onToggleIndicator={onToggleIndicator}
      />,
    );

    expect(markup).toContain('toolbar-inline__rail');
    expect(markup).toContain('toolbar-terminal__actions');
    expect(markup).toContain('toolbar-interval-strip');
    expect(markup).toContain('toolbar-interval-strip__button');
    expect(markup).toContain('toolbar-indicator-trigger');
    expect(markup).toContain('1\u5c0f\u65f6');
    expect(markup).not.toContain('\\u');
  });
});
