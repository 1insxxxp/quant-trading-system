import React, { useState } from 'react';
import type { IndicatorId, IndicatorSettings } from '../types';

interface IndicatorSettingsButtonProps {
  settings: IndicatorSettings;
  onToggle: (indicatorId: IndicatorId, enabled: boolean) => void;
}

const INDICATOR_OPTIONS: Array<{ id: IndicatorId; label: string }> = [
  { id: 'volume', label: '成交量' },
  { id: 'ma5', label: 'MA5' },
  { id: 'ma10', label: 'MA10' },
  { id: 'ma20', label: 'MA20' },
];

export const IndicatorSettingsButton: React.FC<IndicatorSettingsButtonProps> = ({
  settings,
  onToggle,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="indicator-settings">
      <button
        type="button"
        className="indicator-settings__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="indicator-settings__trigger-icon" aria-hidden="true">
          ≋
        </span>
        <span>指标</span>
      </button>

      {isOpen ? (
        <div className="indicator-settings__panel" role="dialog" aria-label="指标设置">
          <strong className="indicator-settings__title">指标显示</strong>
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
