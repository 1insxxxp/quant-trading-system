import React, { useEffect, useId, useRef, useState } from 'react';
import type { IndicatorId, IndicatorSettings } from '../types';

interface IndicatorSettingsButtonProps {
  settings: IndicatorSettings;
  onToggle: (indicatorId: IndicatorId, enabled: boolean) => void;
  iconOnly?: boolean;
  triggerClassName?: string;
}

const INDICATOR_OPTIONS: Array<{ id: IndicatorId; label: string }> = [
  { id: 'volume', label: '成交量' },
  { id: 'ma5', label: 'MA5' },
  { id: 'ma10', label: 'MA10' },
  { id: 'ma20', label: 'MA20' },
  { id: 'ema12', label: 'EMA12' },
  { id: 'ema26', label: 'EMA26' },
  { id: 'rsi', label: 'RSI' },
  { id: 'macd', label: 'MACD' },
  { id: 'bollinger', label: '布林带' },
];

export const IndicatorSettingsButton: React.FC<IndicatorSettingsButtonProps> = ({
  settings,
  onToggle,
  iconOnly = false,
  triggerClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonId = useId();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const triggerClass = [
    'indicator-settings__trigger',
    iconOnly ? 'indicator-settings__trigger--icon-only' : '',
    triggerClassName ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={`indicator-settings${isOpen ? ' indicator-settings--open' : ''}`}>
      <button
        id={buttonId}
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={'\u6307\u6807\u8bbe\u7f6e'}
        title={'\u6307\u6807\u8bbe\u7f6e'}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="indicator-settings__trigger-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="indicator-settings__icon-svg">
            <path d="M3 15H17" />
            <path d="M6 11H14" />
            <path d="M8 7H12" />
            <circle cx="6" cy="15" r="1.2" />
            <circle cx="14" cy="11" r="1.2" />
            <circle cx="8" cy="7" r="1.2" />
          </svg>
        </span>
        {!iconOnly ? <span>{'\u6307\u6807'}</span> : null}
      </button>

      {isOpen ? (
        <div
          id={panelId}
          className="indicator-settings__panel"
          role="dialog"
          aria-labelledby={buttonId}
        >
          <strong className="indicator-settings__title">{'\u6307\u6807\u663e\u793a'}</strong>
          <div className="indicator-settings__options">
            {INDICATOR_OPTIONS.map((option) => (
              <label key={option.id} className="indicator-settings__option">
                <input
                  type="checkbox"
                  checked={settings[option.id]}
                  onChange={(event) => onToggle(option.id, event.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

