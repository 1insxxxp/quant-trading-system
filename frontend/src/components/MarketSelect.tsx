import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface MarketSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface MarketSelectProps {
  label: string;
  value: string;
  options: MarketSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  initialOpen?: boolean;
  testId?: string;
}

export function getNextEnabledOptionIndex(params: {
  currentIndex: number;
  direction: 1 | -1;
  options: MarketSelectOption[];
}): number {
  const { currentIndex, direction, options } = params;

  if (options.length === 0) {
    return -1;
  }

  for (let step = 1; step <= options.length; step += 1) {
    const nextIndex = (currentIndex + direction * step + options.length) % options.length;

    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return currentIndex;
}

export const MarketSelect: React.FC<MarketSelectProps> = ({
  label,
  value,
  options,
  onChange,
  disabled = false,
  initialOpen = false,
  testId,
}) => {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(initialOpen);

  const selectedIndex = useMemo(() => {
    const resolvedIndex = options.findIndex((option) => option.value === value && !option.disabled);

    return resolvedIndex >= 0 ? resolvedIndex : options.findIndex((option) => !option.disabled);
  }, [options, value]);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  useEffect(() => {
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  const commitSelection = (index: number) => {
    const option = options[index];

    if (!option || option.disabled) {
      return;
    }

    onChange(option.value);
    setHighlightedIndex(index);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current < 0 ? selectedIndex : current,
          direction: 1,
          options,
        }));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current < 0 ? selectedIndex : current,
          direction: -1,
          options,
        }));
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();

      if (isOpen) {
        commitSelection(highlightedIndex);
      } else {
        setIsOpen(true);
      }
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current,
          direction: 1,
          options,
        }));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current,
          direction: -1,
          options,
        }));
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitSelection(highlightedIndex);
    }
  };

  return (
    <div ref={containerRef} className={`market-select${disabled ? ' market-select--disabled' : ''}`}>
      <label id={labelId} className="toolbar-label">
        {label}
      </label>
      <button
        type="button"
        className="market-select__trigger"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className="market-select__value">
          {selectedOption?.icon ? <span className="market-select__icon">{selectedOption.icon}</span> : null}
          <span className="market-select__text">{selectedOption?.label ?? '--'}</span>
        </span>
        <span className={`market-select__chevron${isOpen ? ' market-select__chevron--open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div
          className="market-select__panel"
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selectedOption?.value;
            const isHighlighted = index === highlightedIndex;

            return (
              <button
                key={option.value || `${label}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[
                  'market-select__option',
                  isSelected ? 'market-select__option--selected' : '',
                  isHighlighted ? 'market-select__option--highlighted' : '',
                ].filter(Boolean).join(' ')}
                disabled={option.disabled}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitSelection(index)}
              >
                {option.icon ? <span className="market-select__icon">{option.icon}</span> : null}
                <span className="market-select__text">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
