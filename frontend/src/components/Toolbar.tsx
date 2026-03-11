import React, { useEffect, useRef, useState } from 'react';
import type { IndicatorId, IndicatorSettings } from '../types';
import { useMarketStore } from '../stores/marketStore';
import { IndicatorSettingsButton } from './IndicatorSettingsButton';
import { ChartSettingsDialog } from './ChartSettingsDialog';

interface IntervalOption {
  value: string;
  label: string;
  enabled: boolean;
}

const INTERVALS: IntervalOption[] = [
  { value: '1m', label: '1分', enabled: true },
  { value: '5m', label: '5分', enabled: true },
  { value: '15m', label: '15分', enabled: true },
  { value: '1h', label: '1小时', enabled: true },
  { value: '4h', label: '4小时', enabled: true },
  { value: '1d', label: '1日', enabled: true },
];

const EXTENDED_INTERVALS: IntervalOption[] = [
  { value: '1s', label: '1秒', enabled: false },
  ...INTERVALS,
  { value: '30m', label: '30分', enabled: false },
  { value: '2h', label: '2小时', enabled: false },
  { value: '6h', label: '6小时', enabled: false },
  { value: '12h', label: '12小时', enabled: false },
  { value: '2d', label: '2日', enabled: false },
  { value: '3d', label: '3日', enabled: false },
  { value: '5d', label: '5日', enabled: false },
  { value: '1w', label: '1周', enabled: false },
  { value: '1M', label: '1月', enabled: false },
];

interface ToolbarProps {
  indicatorSettings: IndicatorSettings;
  onToggleIndicator: (indicatorId: IndicatorId, enabled: boolean) => void;
}

const HOTKEY_INTERVALS = INTERVALS.map((item) => item.value);

export const Toolbar: React.FC<ToolbarProps> = ({
  indicatorSettings,
  onToggleIndicator,
}) => {
  const interval = useMarketStore((state) => state.interval);
  const setInterval = useMarketStore((state) => state.setInterval);
  const [isIntervalPanelOpen, setIsIntervalPanelOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const intervalPanelRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(
        target?.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select',
      );

      if (isEditable) {
        return;
      }

      const hotkeyIndex = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(hotkeyIndex) || hotkeyIndex < 0 || hotkeyIndex >= HOTKEY_INTERVALS.length) {
        return;
      }

      const nextInterval = HOTKEY_INTERVALS[hotkeyIndex];
      if (!nextInterval || nextInterval === interval) {
        return;
      }

      event.preventDefault();
      setInterval(nextInterval);
      setIsIntervalPanelOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [interval, setInterval]);

  useEffect(() => {
    if (!isIntervalPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!intervalPanelRootRef.current?.contains(event.target as Node)) {
        setIsIntervalPanelOpen(false);
      }
    };

    const handleEscapeDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsIntervalPanelOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscapeDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscapeDown);
    };
  }, [isIntervalPanelOpen]);

  return (
    <div className="toolbar-inline toolbar-inline--terminal">
      <div className="toolbar-inline__rail toolbar-terminal__rail">
        <div className="toolbar-terminal__actions" ref={intervalPanelRootRef}>
          <div className="toolbar-terminal__interval-slot">
            <div className="toolbar-interval-strip">
              <span className="toolbar-label toolbar-interval-strip__label">周期</span>
              <div className="toolbar-interval-strip__buttons" role="tablist" aria-label="K线周期">
                {INTERVALS.map((intervalOption) => (
                  <button
                    key={intervalOption.value}
                    type="button"
                    role="tab"
                    aria-selected={interval === intervalOption.value}
                    className={`toolbar-interval-strip__button ${
                      interval === intervalOption.value ? 'toolbar-interval-strip__button--active' : ''
                    }`}
                    onClick={() => setInterval(intervalOption.value)}
                  >
                    {intervalOption.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`toolbar-interval-strip__more ${isIntervalPanelOpen ? 'toolbar-interval-strip__more--open' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={isIntervalPanelOpen}
                title="更多周期"
                onClick={() => setIsIntervalPanelOpen((value) => !value)}
              >
                <span aria-hidden="true" className="toolbar-interval-strip__more-icon">
                  <svg viewBox="0 0 16 16">
                    <path d="M4.2 6.4L8 10.2l3.8-3.8" />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          {isIntervalPanelOpen ? (
            <div className="toolbar-interval-panel" role="dialog" aria-label="选择时间周期">
              <div className="toolbar-interval-panel__header">
                <strong>选择时间周期</strong>
                <span>键盘 1-6 快捷切换</span>
              </div>
              <div className="toolbar-interval-panel__grid">
                {EXTENDED_INTERVALS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`toolbar-interval-panel__item ${
                      interval === item.value ? 'toolbar-interval-panel__item--active' : ''
                    } ${
                      !item.enabled ? 'toolbar-interval-panel__item--disabled' : ''
                    }`}
                    disabled={!item.enabled}
                    title={item.enabled ? `切换到 ${item.label}` : `${item.label} 即将支持`}
                    onClick={() => {
                      if (!item.enabled) {
                        return;
                      }
                      setInterval(item.value);
                      setIsIntervalPanelOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="toolbar-terminal__control-cluster">
            <IndicatorSettingsButton
              iconOnly
              triggerClassName="toolbar-indicator-trigger"
              settings={indicatorSettings}
              onToggle={onToggleIndicator}
            />

            <button
              type="button"
              className="toolbar-settings-button"
              onClick={() => setIsSettingsDialogOpen(true)}
              title="图表设置"
              aria-label="图表设置"
            >
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <path d="M13.5 8a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ChartSettingsDialog
        isOpen={isSettingsDialogOpen}
        onClose={() => setIsSettingsDialogOpen(false)}
      />
    </div>
  );
};
