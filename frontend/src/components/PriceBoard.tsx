import React, { useEffect, useRef, useState } from 'react';
import {
  formatLivePrice,
  get24HourChangeSnapshot,
  getPriceSnapshot,
  interpolateNumber,
} from '../lib/marketDisplay';
import { getMarketSummary24h } from '../lib/marketSnapshot';
import { useMarketStore } from '../stores/marketStore';
import { InfoTip } from './InfoTip';

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

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export const PriceBoard: React.FC = () => {
  const {
    latestPrice,
    klines,
    isLoadingKlines,
  } = useMarketStore();

  const snapshot = getPriceSnapshot(latestPrice, klines);
  const daySnapshot = get24HourChangeSnapshot(latestPrice, klines);
  const summary = getMarketSummary24h({ latestPrice, klines });
  const isPriceUp = (snapshot.change ?? 0) >= 0;
  const isDayUp = (daySnapshot.change ?? 0) >= 0;
  const animatedPrice = useAnimatedNumber(snapshot.price, !isLoadingKlines);
  const animatedDayChange = useAnimatedNumber(daySnapshot.change, !isLoadingKlines);
  const animatedDayPercent = useAnimatedNumber(daySnapshot.percent, !isLoadingKlines);

  const priceText = isLoadingKlines
    ? '加载中…'
    : animatedPrice !== null
      ? formatLivePrice(animatedPrice)
      : '等待价格';

  const dayChangeText = !isLoadingKlines && daySnapshot.hasChange && animatedDayChange !== null && animatedDayPercent !== null
      ? `${formatSignedNumber(animatedDayChange)} (${formatSignedPercent(animatedDayPercent)})`
    : isLoadingKlines
      ? '切换中…'
      : '等待 24 小时数据';

  return (
    <section className="stats-grid">
      <article className="stat-card stat-card--price">
        <div className="stat-heading">
          <span className="stat-label">最新价格</span>
          <InfoTip
            content="优先显示实时推送价格。切换市场时，会在新的历史 K 线接管后更新。"
            label="最新价格说明"
            bubblePosition="below"
          />
        </div>
        <strong
          className={`stat-value ${isLoadingKlines ? 'stat-value--muted' : snapshot.price !== null ? (isPriceUp ? 'stat-value--up' : 'stat-value--down') : 'stat-value--muted'}`}
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
          <span className="stat-label">24 小时涨跌</span>
          <InfoTip
            content="基于当前市场最近 24 小时窗口计算涨跌额和涨跌幅，优先使用最新实时价格。"
            label="24 小时涨跌说明"
            bubblePosition="below"
          />
        </div>
        <strong className={`stat-value ${!isLoadingKlines && daySnapshot.hasChange ? (isDayUp ? 'stat-value--up' : 'stat-value--down') : 'stat-value--muted'}`}>
          {dayChangeText}
        </strong>
        <div className="stat-meta">
          <span>{isLoadingKlines ? '等待新数据' : '过去 24 小时'}</span>
          <span>{`24h 最高 ${summary.high !== null ? summary.high.toFixed(2) : '--'}`}</span>
          <span>{`24h 最低 ${summary.low !== null ? summary.low.toFixed(2) : '--'}`}</span>
          <span>{`24h 量 ${summary.volume !== null ? summary.volume.toFixed(2) : '--'}`}</span>
          <span>{`24h 额 ${summary.quoteVolume !== null ? summary.quoteVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}`}</span>
        </div>
      </article>

    </section>
  );
};
