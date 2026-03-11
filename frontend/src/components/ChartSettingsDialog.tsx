import React from 'react';
import { useUiStore } from '../stores/uiStore';

interface ChartSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChartSettingsDialog: React.FC<ChartSettingsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const isCrosshairMagnetEnabled = useUiStore((state) => state.isCrosshairMagnetEnabled);
  const toggleCrosshairMagnet = useUiStore((state) => state.toggleCrosshairMagnet);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="chart-settings-overlay" onClick={onClose} />
      <div className="chart-settings-dialog" role="dialog" aria-label="图表设置">
        <div className="chart-settings-dialog__header">
          <h3>设置</h3>
          <button
            type="button"
            className="chart-settings-dialog__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="chart-settings-dialog__content">
          <div className="chart-settings-section">
            <h4 className="chart-settings-section__title">基础设置</h4>
            <label className="chart-settings-checkbox">
              <input
                type="checkbox"
                checked={isCrosshairMagnetEnabled}
                onChange={toggleCrosshairMagnet}
              />
              <span>十字坐标吸附</span>
            </label>
          </div>
        </div>
      </div>
    </>
  );
};
