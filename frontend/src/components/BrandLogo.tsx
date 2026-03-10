import React, { useId } from 'react';

type BrandLogoProps = {
  variant: 'full' | 'mark';
  className?: string;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ variant, className }) => {
  const logoId = useId().replace(/:/g, '');
  const label = variant === 'full' ? 'Quant Trade System logo' : 'Quant Trade System mark';
  const badgeId = `${logoId}-badge`;
  const shellId = `${logoId}-shell`;
  const accentId = `${logoId}-accent`;
  const barsId = `${logoId}-bars`;
  const shadowId = `${logoId}-shadow`;

  return (
    <span className={['brand-logo', `brand-logo--${variant}`, className].filter(Boolean).join(' ')} role="img" aria-label={label}>
      <svg viewBox="0 0 160 160" className="brand-logo__svg" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={badgeId} cx="50%" cy="42%" r="62%">
            <stop offset="0" stopColor="#18365f" />
            <stop offset="0.72" stopColor="#0b1424" />
            <stop offset="1" stopColor="#070d18" />
          </radialGradient>
          <linearGradient id={shellId} x1="26" y1="24" x2="136" y2="134" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#22c7ff" />
            <stop offset="0.52" stopColor="#2377ff" />
            <stop offset="1" stopColor="#45d06f" />
          </linearGradient>
          <linearGradient id={accentId} x1="58" y1="46" x2="106" y2="114" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#dff5ff" />
            <stop offset="1" stopColor="#dce7f8" />
          </linearGradient>
          <linearGradient id={barsId} x1="56" y1="54" x2="104" y2="108" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7de4ff" />
            <stop offset="0.52" stopColor="#4ea0ff" />
            <stop offset="1" stopColor="#7bf17f" />
          </linearGradient>
          <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#081121" floodOpacity="0.24" />
          </filter>
        </defs>

        {variant === 'full' ? (
          <circle
            cx="80"
            cy="80"
            r="72"
            className="brand-logo__badge"
            fill={`url(#${badgeId})`}
            stroke="rgba(140, 186, 255, 0.24)"
            strokeWidth="2"
          />
        ) : null}

        <g filter={`url(#${shadowId})`}>
          <path
            className="brand-logo__shell"
            d="M80 26L118 48V92L80 118L42 92V48L80 26Z"
            fill="none"
            stroke={`url(#${shellId})`}
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <path
            className="brand-logo__shell"
            d="M80 42L103 55V86L80 100L57 86V55L80 42Z"
            fill="none"
            stroke={`url(#${accentId})`}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path
            className="brand-logo__axis"
            d="M36 105L72 69L89 86L126 49"
            fill="none"
            stroke={`url(#${shellId})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="brand-logo__arrow"
            d="M117 48L126 49L125 58"
            fill="none"
            stroke={`url(#${shellId})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="brand-logo__pulse"
            d="M39 103L55 87L67 95L82 79L96 90L111 75"
            fill="none"
            stroke="#5be179"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle cx="34" cy="106" r="5" className="brand-logo__node brand-logo__node--blue" fill="#2377ff" stroke="#07111f" strokeWidth="2.5" />
          <circle cx="126" cy="49" r="5" className="brand-logo__node brand-logo__node--green" fill="#7bf17f" stroke="#07111f" strokeWidth="2.5" />
          <circle cx="111" cy="75" r="4.5" className="brand-logo__node brand-logo__node--green" fill="#7bf17f" stroke="#07111f" strokeWidth="2.5" />

          <path className="brand-logo__bar" d="M60 90H68V71H60Z" fill={`url(#${barsId})`} />
          <path className="brand-logo__bar" d="M74 96H82V58H74Z" fill={`url(#${barsId})`} />
          <path className="brand-logo__bar" d="M88 86H96V66H88Z" fill={`url(#${barsId})`} />

          <path className="brand-logo__wick" d="M64 63V96" fill="none" stroke="#d9eefb" strokeWidth="2.5" strokeLinecap="round" />
          <path className="brand-logo__wick" d="M78 50V104" fill="none" stroke="#d9eefb" strokeWidth="2.5" strokeLinecap="round" />
          <path className="brand-logo__wick" d="M92 58V92" fill="none" stroke="#d9eefb" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
};
