import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartInspector } from './ChartInspector';

describe('ChartInspector', () => {
  it('renders the latest candle details as an inline hud row', () => {
    const markup = renderToStaticMarkup(
      <ChartInspector
        marketLabel="ETH/USDT · 5分钟 · BINANCE"
        snapshot={{
          open: 2020,
          high: 2035,
          low: 2012,
          close: 2025.27,
          change: 5.27,
          percent: 0.26,
        }}
      />,
    );

    expect(markup).toContain('ETH/USDT · 5分钟 · BINANCE');
    expect(markup).toContain('chart-inspector__metric-label">开<');
    expect(markup).toContain('chart-inspector__metric-label">高<');
    expect(markup).toContain('chart-inspector__metric-label">低<');
    expect(markup).toContain('chart-inspector__metric-label">收<');
    expect(markup).toContain('chart-inspector__metric-label">涨跌<');
    expect(markup).toContain('2,020.00');
    expect(markup).toContain('2,035.00');
    expect(markup).toContain('2,012.00');
    expect(markup).toContain('2,025.27');
    expect(markup).toContain('+5.27 (+0.26%)');
    expect(markup.match(/chart-inspector__metric-value--up/g)?.length).toBe(5);
    expect(markup).not.toContain('2026-03-09 23:30');
    expect(markup).not.toContain('成交量');
    expect(markup).not.toContain('成交额');
  });

  it('renders down candles with a negative direction class', () => {
    const markup = renderToStaticMarkup(
      <ChartInspector
        marketLabel="ETH/USDT · 1小时 · OKX"
        snapshot={{
          open: 2020,
          high: 2035,
          low: 2012,
          close: 2012.1,
          change: -7.9,
          percent: -0.39,
        }}
      />,
    );

    expect(markup).toContain('chart-inspector--down');
    expect(markup.match(/chart-inspector__metric-value--down/g)?.length).toBe(5);
    expect(markup).toContain('-7.90 (-0.39%)');
  });
});
