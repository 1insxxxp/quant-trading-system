import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartInspector } from './ChartInspector';

describe('ChartInspector', () => {
  it('renders the latest candle details', () => {
    const markup = renderToStaticMarkup(
      <ChartInspector
        marketLabel="BINANCE / ETH/USDT / 5m"
        snapshot={{
          timeLabel: '2026-03-09 23:30',
          open: 2020,
          high: 2035,
          low: 2012,
          close: 2025.27,
          change: 5.27,
          percent: 0.26,
          volume: 320.5,
          quoteVolume: 649244.04,
        }}
        showVolume
      />,
    );

    expect(markup).toContain('BINANCE / ETH/USDT / 5m');
    expect(markup).toContain('2026-03-09 23:30');
    expect(markup).toContain('chart-inspector__chip-label">开<');
    expect(markup).toContain('chart-inspector__chip-label">高<');
    expect(markup).toContain('chart-inspector__chip-label">低<');
    expect(markup).toContain('chart-inspector__chip-label">收<');
    expect(markup).toContain('chart-inspector__chip-label">涨跌<');
    expect(markup).toContain('2,020.00');
    expect(markup).toContain('2,035.00');
    expect(markup).toContain('2,012.00');
    expect(markup).toContain('2,025.27');
    expect(markup).toContain('+5.27 (0.26%)');
    expect(markup).toContain('649,244.04');
  });

  it('hides volume fields when the volume indicator is disabled', () => {
    const markup = renderToStaticMarkup(
      <ChartInspector
        marketLabel="BINANCE / ETH/USDT / 5m"
        snapshot={{
          timeLabel: '2026-03-09 23:30',
          open: 2020,
          high: 2035,
          low: 2012,
          close: 2025.27,
          change: 5.27,
          percent: 0.26,
          volume: 320.5,
          quoteVolume: 649244.04,
        }}
        showVolume={false}
      />,
    );

    expect(markup).not.toContain('成交量');
    expect(markup).not.toContain('成交额');
  });
});
