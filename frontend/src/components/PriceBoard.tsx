import React, { useEffect, useRef, useState } from 'react';
import {
  formatMarketSymbol,
  getPriceSnapshot,
  interpolateNumber,
} from '../lib/marketDisplay';
import { useMarketStore } from '../stores/marketStore';
import { InfoTip } from './InfoTip';

const INTERVAL_LABELS: Record<string, string> = {
  '1m': '1 分钟',
  '5m': '5 分钟',
  '15m': '15 分钟',
  '1h': '1 小时',
  '4h': '4 小时',
  '1d': '1 天',
};

const ANIMATION_DURATION_MS = 420;

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function useAnimatedNumber(value: number | null, shouldAnimate: boolean): number | null {
  const [displayValue, setDisplayValue] = useState<number | null>(value);
  const displayValueRef = useRef<number | null>(value);

  useEffect(() => {
    if (value === null) {
      displayValueRef.current = null;
      setDisplayValue(null);
      return;
    }

    if (!shouldAnimate) {
      displayValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = displayValueRef.current;

    if (
      startValue === null ||
      !Number.isFinite(startValue) ||
      Math.abs(startValue - value) < Number.EPSILON ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      displayValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    let frameId = 0;
    const startTime = window.performance.now();

    const tick = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startTime) / ANIMATION_DURATION_MS);
      const nextValue = interpolateNumber(startValue, value, easeOutCubic(progress));
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      displayValueRef.current = value;
      setDisplayValue(value);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [shouldAnimate, value]);

  return displayValue;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export const PriceBoard: React.FC = () => {
  const {
    latestPrice,
    exchange,
    symbol,
    interval,
    isConnected,
    klines,
    isLoadingKlines,
  } = useMarketStore();

  const snapshot = getPriceSnapshot(latestPrice, klines);
  const isUp = (snapshot.change ?? 0) >= 0;
  const formattedSymbol = formatMarketSymbol(symbol);
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
  const animatedPrice = useAnimatedNumber(snapshot.price, !isLoadingKlines);
  const animatedChange = useAnimatedNumber(snapshot.change, !isLoadingKlines);
  const animatedPercent = useAnimatedNumber(snapshot.percent, !isLoadingKlines);

  const priceText = isLoadingKlines
    ? '加载中...'
    : animatedPrice !== null
      ? formatCurrency(animatedPrice)
      : '等待价格';

  const changeText = !isLoadingKlines && snapshot.hasChange && animatedChange !== null && animatedPercent !== null
    ? `${formatSignedNumber(animatedChange)} (${formatSignedPercent(animatedPercent)})`
    : isLoadingKlines
      ? '切换中...'
      : '等待历史 K 线';

  return (
    <section className="stats-grid">
      <article className="stat-card stat-card--price">
        <div className="stat-heading">
          <span className="stat-label">最新价格</span>
          <InfoTip
            content="优先显示实时推送价格。切换市场时，会在新的历史 K 线接管后更新。"
            label="最新价格说明"
          />
        </div>
        <strong
          className={`stat-value ${isLoadingKlines ? 'stat-value--muted' : snapshot.price !== null ? (isUp ? 'stat-value--up' : 'stat-value--down') : 'stat-value--muted'}`}
          data-testid="latest-price"
        >
          {priceText}
        </strong>
        <div className="stat-meta">
          <span>{isLoadingKlines ? '正在切换市场' : '实时价格优先'}</span>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-heading">
          <span className="stat-label">区间涨跌</span>
          <InfoTip
            content="基于当前已加载的 K 线区间计算，不代表完整 24 小时涨跌。"
            label="区间涨跌说明"
          />
        </div>
        <strong className={`stat-value ${!isLoadingKlines && snapshot.hasChange ? (isUp ? 'stat-value--up' : 'stat-value--down') : 'stat-value--muted'}`}>
          {changeText}
        </strong>
        <div className="stat-meta">
          <span>{isLoadingKlines ? '等待新数据' : '基于已加载区间'}</span>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-heading">
          <span className="stat-label">连接状态</span>
          <InfoTip
            content="连接在线时，当前未收盘 K 线会持续接收最新更新。"
            label="连接状态说明"
          />
        </div>
        <span className={`status-pill ${isConnected ? 'status-pill--live' : 'status-pill--waiting'}`}>
          {isConnected ? '链路在线' : '重连中'}
        </span>
        <div className="stat-meta">
          <span>{isLoadingKlines ? '正在同步图表数据' : isConnected ? '实时更新中' : '等待重连'}</span>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-heading">
          <span className="stat-label">当前市场</span>
          <InfoTip
            content="显示当前交易所、交易对、周期和已加载的 K 线数量。"
            label="当前市场说明"
          />
        </div>
        <strong className="stat-market">{exchange.toUpperCase()} / {formattedSymbol}</strong>
        <div className="stat-meta">
          <span>{intervalLabel}</span>
          <span>{isLoadingKlines ? 'K 线加载中' : `${klines.length} 根`}</span>
        </div>
      </article>
    </section>
  );
};
