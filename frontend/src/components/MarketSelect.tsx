import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface MarketSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  baseAsset?: string;
  quoteAsset?: string;
}

interface MarketSelectProps {
  label: string;
  value: string;
  options: MarketSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  initialOpen?: boolean;
  testId?: string;
  searchable?: boolean;
  placeholder?: string;
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

/**
 * 将中文拼音首字母转换为英文 (简易版)
 * 支持常见交易对前缀：B=币/BTC, E=乙/ETH, S=SOL, D=狗狗币/DOT, X=XRP, C=ADA 等
 */
function getPinyinInitials(text: string): string {
  const pinyinMap: Record<string, string> = {
    // 常见中文数字和/crypto 相关
    '币': 'B',
    '比': 'B',
    '乙': 'Y',
    '太': 'T',
    '梭': 'S',
    '瑞': 'R',
    '波': 'B',
    '卡': 'K',
    '狗': 'G',
    '柴': 'C',
    '特': 'T',
  };

  let result = '';
  for (const char of text) {
    if (pinyinMap[char]) {
      result += pinyinMap[char];
    } else if (/[\u4e00-\u9fa5]/.test(char)) {
      // 其他中文字符取拼音首字母 (简化处理：取 Unicode 码高位作为区分)
      result += char.charAt(0);
    } else {
      result += char;
    }
  }
  return result.toUpperCase();
}

/**
 * 搜索匹配：支持英文、中文、拼音首字母
 */
function matchesSearchQuery(option: MarketSelectOption, query: string): boolean {
  if (!query.trim()) {
    return true;
  }

  const upperQuery = query.toUpperCase().trim();
  const label = option.label || '';
  const value = option.value || '';
  const baseAsset = option.baseAsset || '';
  const quoteAsset = option.quoteAsset || '';

  // 完全匹配
  if (value.toUpperCase().includes(upperQuery)) {
    return true;
  }

  // label 匹配 (如 "BTC/USDT")
  if (label.toUpperCase().includes(upperQuery)) {
    return true;
  }

  // 资产匹配
  if (baseAsset.toUpperCase().includes(upperQuery) || quoteAsset.toUpperCase().includes(upperQuery)) {
    return true;
  }

  // 拼音首字母匹配 (如 "bte" -> "BTC/ETH")
  const labelInitials = getPinyinInitials(label) + label.replace(/[^A-Z]/g, '');
  if (labelInitials.toUpperCase().includes(upperQuery)) {
    return true;
  }

  // 价值首字母匹配 (BTCUSDT -> BTC)
  const valueInitials = value.split(/(?=[A-Z])/).slice(0, 2).join('');
  if (valueInitials.includes(upperQuery)) {
    return true;
  }

  return false;
}

export const MarketSelect: React.FC<MarketSelectProps> = ({
  label,
  value,
  options,
  onChange,
  disabled = false,
  initialOpen = false,
  testId,
  searchable = false,
  placeholder = '搜索...',
}) => {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedIndex = useMemo(() => {
    const resolvedIndex = options.findIndex((option) => option.value === value && !option.disabled);

    return resolvedIndex >= 0 ? resolvedIndex : options.findIndex((option) => !option.disabled);
  }, [options, value]);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) {
      return options;
    }
    return options.filter((option) => matchesSearchQuery(option, searchQuery));
  }, [options, searchable, searchQuery]);

  useEffect(() => {
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex]);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

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
    const option = filteredOptions[index];

    if (!option || option.disabled) {
      return;
    }

    onChange(option.value);
    setSearchQuery('');
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
          options: filteredOptions,
        }));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current < 0 ? selectedIndex : current,
          direction: -1,
          options: filteredOptions,
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
          options: filteredOptions,
        }));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) =>
        getNextEnabledOptionIndex({
          currentIndex: current,
          direction: -1,
          options: filteredOptions,
        }));
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitSelection(highlightedIndex);
    }

    if (event.key === 'Escape') {
      setSearchQuery('');
      setIsOpen(false);
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
          <svg viewBox="0 0 16 16" className="market-select__chevron-svg">
            <path d="M4.2 6.4L8 10.2l3.8-3.8" />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div
          className={`market-select__panel${searchable ? ' market-select__panel--with-search' : ''}`}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
          {searchable && (
            <div className="market-select__search">
              <input
                ref={searchInputRef}
                type="text"
                className="market-select__search-input"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label="搜索交易对"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="market-select__search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="清除搜索"
                >
                  ×
                </button>
              )}
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="market-select__empty">暂无匹配结果</div>
          ) : (
            filteredOptions.map((option, index) => {
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
            })
          )}
        </div>
      ) : null}
    </div>
  );
};
