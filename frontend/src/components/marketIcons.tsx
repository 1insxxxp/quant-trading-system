import React from 'react';

export const ExchangeIcon: React.FC<{ exchange: string }> = ({ exchange }) => {
  const normalized = exchange.toLowerCase();

  if (normalized === 'okx') {
    return (
      <span className="market-icon market-icon--exchange market-icon--exchange-okx" aria-hidden="true">
        <svg viewBox="0 0 18 18" className="market-icon__svg">
          <rect x="0.5" y="0.5" width="17" height="17" rx="4.75" fill="#FFFFFF" />
          <rect x="2.45" y="2.45" width="5.15" height="5.15" rx="0.7" fill="#000000" />
          <rect x="10.4" y="2.45" width="5.15" height="5.15" rx="0.7" fill="#000000" />
          <rect x="2.45" y="10.4" width="5.15" height="5.15" rx="0.7" fill="#000000" />
          <rect x="10.4" y="10.4" width="5.15" height="5.15" rx="0.7" fill="#000000" />
        </svg>
      </span>
    );
  }

  return (
    <span className="market-icon market-icon--exchange market-icon--exchange-binance" aria-hidden="true">
      <svg viewBox="0 0 18 18" className="market-icon__svg">
        <path d="M9 1.5 12.4 4.9 9 8.3 5.6 4.9Z" fill="#F0B90B" />
        <path d="M13.1 5.6 16.5 9 13.1 12.4 9.7 9Z" fill="#F0B90B" />
        <path d="M4.9 5.6 8.3 9 4.9 12.4 1.5 9Z" fill="#F0B90B" />
        <path d="M9 9.7 12.4 13.1 9 16.5 5.6 13.1Z" fill="#F0B90B" />
        <path d="M9 5.9 12.1 9 9 12.1 5.9 9Z" fill="#F0B90B" />
      </svg>
    </span>
  );
};

export const AssetIcon: React.FC<{ asset?: string }> = ({ asset }) => {
  const normalized = (asset ?? '?').toUpperCase();

  if (normalized === 'BTC') {
    return (
      <span className="market-icon market-icon--asset market-icon--asset-btc" aria-hidden="true">
        <svg viewBox="0 0 18 18" className="market-icon__svg">
          <circle cx="9" cy="9" r="8" fill="#F7931A" />
          <text
            x="9"
            y="10.65"
            fill="#FFFFFF"
            fontFamily="Arial, sans-serif"
            fontSize="9.2"
            fontStyle="italic"
            fontWeight="700"
            textAnchor="middle"
          >
            ₿
          </text>
        </svg>
      </span>
    );
  }

  if (normalized === 'ETH') {
    return (
      <span className="market-icon market-icon--asset market-icon--asset-eth" aria-hidden="true">
        <svg viewBox="0 0 18 18" className="market-icon__svg">
          <path d="M9 1.1 4.75 8.2 9 10.35 13.25 8.2Z" fill="#141414" />
          <path d="M9 1.1V10.35L13.25 8.2Z" fill="#3C3C3D" />
          <path d="M9 16.9 4.75 10.75 9 12.85 13.25 10.75Z" fill="#141414" />
          <path d="M9 12.85V16.9L13.25 10.75Z" fill="#6A6A6A" />
        </svg>
      </span>
    );
  }

  const symbol = resolveAssetGlyph(normalized);

  return (
    <span className={`market-icon market-icon--asset market-icon--asset-${normalized.toLowerCase()}`} aria-hidden="true">
      <span className="market-icon__coin-glyph">{symbol}</span>
    </span>
  );
};

function resolveAssetGlyph(asset: string): string {
  if (asset === 'BTC') {
    return 'B';
  }

  if (asset === 'ETH') {
    return 'Ξ';
  }

  return asset.slice(0, 1);
}
