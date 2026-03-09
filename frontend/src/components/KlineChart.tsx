import React, { useEffect, useRef } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { formatMarketSymbol } from '../lib/marketDisplay';
import { useMarketStore } from '../stores/marketStore';
import { Toolbar } from './Toolbar';
import {
  buildCandlestickData,
  resolveChartUpdateMode,
  shouldLoadOlderKlines,
} from './klineChartData';

export const KlineChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const previousDataRef = useRef<CandlestickData[]>([]);
  const previousMarketKeyRef = useRef<string | null>(null);

  const {
    klines,
    klineSource,
    exchange,
    symbol,
    interval,
    isConnected,
    isLoadingKlines,
    isLoadingOlderKlines,
  } = useMarketStore();

  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 620,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#425466',
      },
      grid: {
        vertLines: { color: '#edf1f5' },
        horzLines: { color: '#edf1f5' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: '#dce3ea',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#dce3ea',
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#0ea765',
      downColor: '#e15656',
      borderVisible: false,
      wickUpColor: '#0ea765',
      wickDownColor: '#e15656',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    previousDataRef.current = [];

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    const handleVisibleRangeChange = (range: { from: number; to: number } | null) => {
      if (
        shouldLoadOlderKlines({
          visibleFrom: range?.from,
          isLoadingOlderKlines: useMarketStore.getState().isLoadingOlderKlines,
          hasMoreHistoricalKlines: useMarketStore.getState().hasMoreHistoricalKlines,
        })
      ) {
        void useMarketStore.getState().loadOlderKlines();
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
      previousDataRef.current = [];
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const marketKey = `${exchange}:${symbol}:${interval}`;

    if (klines.length === 0) {
      candleSeriesRef.current.setData([]);
      previousDataRef.current = [];
      previousMarketKeyRef.current = marketKey;
      return;
    }

    const data = buildCandlestickData(klines);

    const previousData = previousDataRef.current;
    const nextLast = data[data.length - 1];
    const updateMode = resolveChartUpdateMode({
      previousData,
      nextData: data,
      previousMarketKey: previousMarketKeyRef.current,
      nextMarketKey: marketKey,
    });

    if (updateMode === 'replace') {
      candleSeriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    } else if (updateMode === 'prepend') {
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      const prependedCount = data.length - previousData.length;

      candleSeriesRef.current.setData(data);

      if (visibleRange && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: visibleRange.from + prependedCount,
          to: visibleRange.to + prependedCount,
        });
      }
    } else if (nextLast) {
      candleSeriesRef.current.update(nextLast);

      if (updateMode === 'append') {
        chartRef.current?.timeScale().scrollToRealTime();
      }
    }

    previousDataRef.current = data;
    previousMarketKeyRef.current = marketKey;
  }, [klines, exchange, symbol, interval]);

  return (
    <section className="chart-panel">
      <div className="chart-panel__terminal-bar">
        <div className="chart-panel__market">
          <span className="chart-panel__market-label">市场</span>
          <strong className="chart-panel__market-title">
            {exchange.toUpperCase()} / {formatMarketSymbol(symbol)}
          </strong>
        </div>

        <div className="chart-panel__controls chart-panel__controls--terminal">
          <Toolbar />
        </div>

        <div className="chart-badges chart-badges--terminal">
          <span className="chart-badge">{interval}</span>
          <span className="chart-badge">{klines.length} 根</span>
          <span className={`chart-badge chart-badge--${klineSource}`}>
            {klineSource === 'cache' ? '缓存' : '实时'}
          </span>
          <span className={`chart-badge chart-badge--${isConnected ? 'live' : 'waiting'}`}>
            {isConnected ? '推送中' : '等待中'}
          </span>
        </div>
      </div>

      <div className={`chart-panel__body ${isLoadingKlines ? 'chart-panel__body--loading' : ''}`}>
        {isLoadingOlderKlines && !isLoadingKlines ? (
          <div className="chart-history-status" role="status" aria-live="polite">
            <span className="chart-history-status__dot" aria-hidden="true" />
            <span>正在加载更早的历史 K 线</span>
          </div>
        ) : null}

        <div
          ref={chartContainerRef}
          data-testid="kline-chart"
          className={`chart-canvas ${isLoadingKlines ? 'chart-canvas--dimmed' : ''}`}
        />

        {isLoadingKlines ? (
          <div className="chart-overlay chart-overlay--loading">
            <span className="chart-spinner" aria-hidden="true" />
            <strong>正在加载 K 线数据</strong>
            <span>切换已经生效，新的历史数据返回后会自动替换当前图表。</span>
          </div>
        ) : null}

        {!isLoadingKlines && klines.length === 0 ? (
          <div className="chart-overlay">
            <strong>等待市场数据</strong>
            <span>当前筛选条件下还没有可用 K 线，请稍后重试或切换市场。</span>
          </div>
        ) : null}
      </div>
    </section>
  );
};
