import React, { useMemo } from 'react';

const DIGIT_TRACK = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

interface RollingDigitsProps {
  value: string;
  className?: string;
}

export function RollingDigits({ value, className }: RollingDigitsProps) {
  const characters = useMemo(() => Array.from(value), [value]);

  return (
    <span className={['rolling-digits', className].filter(Boolean).join(' ')} aria-label={value}>
      <span className="rolling-digits__raw">{value}</span>
      {characters.map((char, index) => {
        if (!/[0-9]/.test(char)) {
          return (
            <span key={`sep-${index}-${char}`} className="rolling-digits__separator" aria-hidden="true">
              {char}
            </span>
          );
        }

        return (
          <span key={`digit-${index}`} className="rolling-digits__digit" aria-hidden="true">
            <span
              className="rolling-digits__track"
              style={{ '--digit-target': Number(char) } as React.CSSProperties}
            >
              {DIGIT_TRACK.map((digit) => (
                <span key={`${index}-${digit}`} className="rolling-digits__cell">
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
