import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AssetIcon, ExchangeIcon } from './marketIcons';

describe('marketIcons', () => {
  it('renders exchange icons with official brand fills', () => {
    const markup = renderToStaticMarkup(
      <div>
        <ExchangeIcon exchange="binance" />
        <ExchangeIcon exchange="okx" />
      </div>,
    );

    expect(markup).toContain('market-icon--exchange-binance');
    expect(markup).toContain('fill="#F0B90B"');
    expect(markup).toContain('market-icon--exchange-okx');
    expect(markup).toContain('fill="#FFFFFF"');
    expect(markup).toContain('fill="#000000"');
  });

  it('renders btc and eth as dedicated svg icons instead of fallback glyphs', () => {
    const markup = renderToStaticMarkup(
      <div>
        <AssetIcon asset="BTC" />
        <AssetIcon asset="ETH" />
      </div>,
    );

    expect(markup).toContain('market-icon--asset-btc');
    expect(markup).toContain('fill="#F7931A"');
    expect(markup).toContain('₿');
    expect(markup).toContain('market-icon--asset-eth');
    expect(markup).toContain('fill="#141414"');
    expect(markup).not.toContain('market-icon__coin-glyph');
  });
});
