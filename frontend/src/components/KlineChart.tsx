import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type MouseEventParams,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { formatMarketSymbol } from '../lib/marketDisplay';
import {
  formatChartCrosshairTime,
  formatChartIntervalLabel,
  formatChartVolumeLegendValue,
  resolveTimestampFromChartTime,
} from '../lib/chartTimeFormat';
import { useMarketStore } from '../stores/marketStore';
import { type ThemeMode, useUiStore } from '../stores/uiStore';
import { ChartInspector, type ChartInspectorSnapshot } from './ChartInspector';
import { IndicatorSettingsButton } from './IndicatorSettingsButton';
import { Toolbar } from './Toolbar';
import {
  buildCandlestickData,
  resolveChartUpdateMode,
  shouldLoadOlderKlines,
} from './klineChartData';
import { buildIndicatorLegend, syncIndicatorSeries } from './klineChartIndicators';
import {
  buildChartViewStateKey,
  canRestoreChartVisibleRange,
  readChartVisibleRange,
  writeChartVisibleRange,
} from '../lib/chartViewState';
import type { Kline } from '../types';

const MIN_CHART_HEIGHT = 460;

export const KlineChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const previousDataRef = useRef<CandlestickData[]>([]);
  const previousMarketKeyRef = useRef<string | null>(null);
  const isHistoryPagingReadyRef = useRef(false);
  const historyPagingArmFrameRef = useRef<number | null>(null);
  const [hoveredKline, setHoveredKline] = useState<Kline | null>(null);
  const theme = useUiStore((state) => state.theme);

  const {
    klines,
    exchange,
    symbol,
    interval,
    isLoadingKlines,
    isLoadingOlderKlines,
    indicatorSettings,
    updateIndicatorSetting,
  } = useMarketStore();

  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const initialTheme = getChartTheme(theme);
    const initialHeight = Math.max(chartContainerRef.current.clientHeight, MIN_CHART_HEIGHT);
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: initialHeight,
      layout: initialTheme.layout,
      grid: initialTheme.grid,
      crosshair: {
        mode: 1,
        vertLine: {
          color: initialTheme.crosshairColor,
        },
        horzLine: {
          color: initialTheme.crosshairColor,
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          const timestamp = resolveTimestampFromChartTime(time);

          return timestamp === null ? '' : formatChartCrosshairTime(timestamp);
        },
      },
      timeScale: {
        borderColor: initialTheme.scaleBorderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: initialTheme.scaleBorderColor,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: initialTheme.candleUpColor,
      downColor: initialTheme.candleDownColor,
      borderVisible: false,
      wickUpColor: initialTheme.candleUpColor,
      wickDownColor: initialTheme.candleDownColor,
    });
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    const ma5Series = chart.addLineSeries({
      color: initialTheme.ma5Color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma10Series = chart.addLineSeries({
      color: initialTheme.ma10Color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma20Series = chart.addLineSeries({
      color: initialTheme.ma20Color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ma5SeriesRef.current = ma5Series;
    ma10SeriesRef.current = ma10Series;
    ma20SeriesRef.current = ma20Series;
    previousDataRef.current = [];

    const resizeChart = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: Math.max(chartContainerRef.current.clientHeight, MIN_CHART_HEIGHT),
        });
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          resizeChart();
        })
      : null;

    resizeObserver?.observe(chartContainerRef.current);
    window.addEventListener('resize', resizeChart);

    const handleVisibleRangeChange = (range: { from: number; to: number } | null) => {
      if (
        shouldLoadOlderKlines({
          visibleFrom: range?.from,
          isLoadingOlderKlines: useMarketStore.getState().isLoadingOlderKlines,
          hasMoreHistoricalKlines: useMarketStore.getState().hasMoreHistoricalKlines,
          isHistoryPagingReady: isHistoryPagingReadyRef.current,
        })
      ) {
        void useMarketStore.getState().loadOlderKlines();
      }
    };

    const handleVisibleTimeRangeChange = (
      range: { from: Time; to: Time } | null,
    ) => {
      const chartVisibleRange = normalizeChartVisibleRange(range);

      if (!chartVisibleRange) {
        return;
      }

      const state = useMarketStore.getState();
      const viewStateKey = buildChartViewStateKey(state.exchange, state.symbol, state.interval);
      writeChartVisibleRange(viewStateKey, chartVisibleRange);
    };

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      setHoveredKline(resolveKlineFromCrosshair({
        param,
        klines: useMarketStore.getState().klines,
      }));
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange as never);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeChart);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange as never);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (historyPagingArmFrameRef.current !== null) {
        window.cancelAnimationFrame(historyPagingArmFrameRef.current);
      }
      isHistoryPagingReadyRef.current = false;
      previousDataRef.current = [];
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const nextTheme = getChartTheme(theme);

    chartRef.current?.applyOptions({
      layout: nextTheme.layout,
      grid: nextTheme.grid,
      crosshair: {
        mode: 1,
        vertLine: {
          color: nextTheme.crosshairColor,
        },
        horzLine: {
          color: nextTheme.crosshairColor,
        },
      },
      timeScale: {
        borderColor: nextTheme.scaleBorderColor,
      },
      rightPriceScale: {
        borderColor: nextTheme.scaleBorderColor,
      },
    });

    candleSeriesRef.current?.applyOptions({
      upColor: nextTheme.candleUpColor,
      downColor: nextTheme.candleDownColor,
      wickUpColor: nextTheme.candleUpColor,
      wickDownColor: nextTheme.candleDownColor,
    });
    ma5SeriesRef.current?.applyOptions({ color: nextTheme.ma5Color });
    ma10SeriesRef.current?.applyOptions({ color: nextTheme.ma10Color });
    ma20SeriesRef.current?.applyOptions({ color: nextTheme.ma20Color });
  }, [theme]);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const marketKey = `${exchange}:${symbol}:${interval}`;

    if (klines.length === 0) {
      candleSeriesRef.current.setData([]);
      syncIndicatorSeries({
        klines: [],
        settings: indicatorSettings,
        series: {
          volume: volumeSeriesRef.current,
          ma5: ma5SeriesRef.current,
          ma10: ma10SeriesRef.current,
          ma20: ma20SeriesRef.current,
        },
      });
      previousDataRef.current = [];
      previousMarketKeyRef.current = marketKey;
      return;
    }

    const data = buildCandlestickData(klines, interval);
    const previousData = previousDataRef.current;
    const nextLast = data[data.length - 1];
    const updateMode = resolveChartUpdateMode({
      previousData,
      nextData: data,
      previousMarketKey: previousMarketKeyRef.current,
      nextMarketKey: marketKey,
    });

    if (updateMode === 'replace') {
      isHistoryPagingReadyRef.current = false;
      if (historyPagingArmFrameRef.current !== null) {
        window.cancelAnimationFrame(historyPagingArmFrameRef.current);
      }

      candleSeriesRef.current.setData(data);
      const firstTime = normalizeChartTimeValue(data[0]?.time);
      const lastTime = normalizeChartTimeValue(nextLast?.time);
      const storedVisibleRange = readChartVisibleRange(
        buildChartViewStateKey(exchange, symbol, interval),
      );

      if (
        chartRef.current &&
        firstTime !== null &&
        lastTime !== null &&
        storedVisibleRange !== null &&
        canRestoreChartVisibleRange(storedVisibleRange, {
          firstTime,
          lastTime,
        })
      ) {
        chartRef.current.timeScale().setVisibleRange({
          from: storedVisibleRange.from as Time,
          to: storedVisibleRange.to as Time,
        });
      } else {
        chartRef.current?.timeScale().fitContent();
      }

      historyPagingArmFrameRef.current = window.requestAnimationFrame(() => {
        isHistoryPagingReadyRef.current = true;
        historyPagingArmFrameRef.current = null;
      });
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
    } else if (updateMode === 'repair') {
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      const addedCount = data.length - previousData.length;
      const previousLastLogical = previousData.length - 1;
      const isNearRealtime = Boolean(
        visibleRange &&
        previousLastLogical >= 0 &&
        visibleRange.to >= previousLastLogical - 5,
      );

      candleSeriesRef.current.setData(data);

      if (isNearRealtime) {
        chartRef.current?.timeScale().scrollToRealTime();
      } else if (visibleRange && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: visibleRange.from,
          to: visibleRange.to + Math.max(0, addedCount),
        });
      }
    } else if (nextLast) {
      candleSeriesRef.current.update(nextLast);

      if (updateMode === 'append') {
        chartRef.current?.timeScale().scrollToRealTime();
      }
    }

    syncIndicatorSeries({
      klines,
      settings: indicatorSettings,
      series: {
        volume: volumeSeriesRef.current,
        ma5: ma5SeriesRef.current,
        ma10: ma10SeriesRef.current,
        ma20: ma20SeriesRef.current,
      },
    });

    previousDataRef.current = data;
    previousMarketKeyRef.current = marketKey;
  }, [klines, exchange, symbol, interval, indicatorSettings]);

  useEffect(() => {
    setHoveredKline(null);
  }, [klines, exchange, symbol, interval]);

  const legendItems = buildIndicatorLegend(klines, indicatorSettings);
  const activeKline = hoveredKline ?? klines[klines.length - 1] ?? null;
  const activeSnapshot = buildInspectorSnapshot(activeKline);
  const inspectorMarketLabel = `${formatMarketSymbol(symbol)} · ${formatChartIntervalLabel(interval)} · ${exchange.toUpperCase()}`;
  const activeDirection =
    activeSnapshot === null ? 'flat' : activeSnapshot.change > 0 ? 'up' : activeSnapshot.change < 0 ? 'down' : 'flat';

  return (
    <section className="chart-panel chart-workspace">
      <div className="chart-workspace__header">
        <div className="chart-workspace__header-main">
          <Toolbar />
        </div>
        <div className="chart-workspace__header-actions">
          <IndicatorSettingsButton
            settings={indicatorSettings}
            onToggle={(indicatorId, enabled) => {
              void updateIndicatorSetting(indicatorId, enabled);
            }}
          />
        </div>
      </div>

      <div className={`chart-panel__body ${isLoadingKlines ? 'chart-panel__body--loading' : ''}`}>
        <div className="chart-panel__body-frame" />
        <div className="chart-panel__hud">
          <ChartInspector
            marketLabel={inspectorMarketLabel}
            snapshot={activeSnapshot}
          />
          {legendItems.length > 0 ? (
            <div className="chart-panel__hud-legend">
              {legendItems.map((item) => (
                <span key={item.label} className={`chart-indicator ${item.colorClass}`}>
                  {item.label}
                  {item.value !== null ? ` ${item.value.toFixed(2)}` : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {indicatorSettings.volume && activeKline ? (
          <div className={`chart-volume-legend chart-volume-legend--${activeDirection}`}>
            <span className="chart-volume-legend__label">成交量(Volume)</span>
            <span className="chart-volume-legend__value">
              {formatChartVolumeLegendValue(activeKline.volume)}
            </span>
          </div>
        ) : null}

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

function buildInspectorSnapshot(kline: Kline | null): ChartInspectorSnapshot | null {
  if (!kline) {
    return null;
  }

  return {
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
    change: kline.close - kline.open,
    percent: kline.open === 0 ? 0 : ((kline.close - kline.open) / kline.open) * 100,
  };
}

function getChartTheme(theme: ThemeMode) {
  if (theme === 'light') {
    return {
      layout: {
        background: { color: '#f5fbff' },
        textColor: '#46617c',
      },
      grid: {
        vertLines: { color: 'rgba(91, 134, 184, 0.12)' },
        horzLines: { color: 'rgba(91, 134, 184, 0.12)' },
      },
      crosshairColor: 'rgba(67, 127, 194, 0.35)',
      scaleBorderColor: 'rgba(99, 145, 198, 0.22)',
      candleUpColor: '#12a875',
      candleDownColor: '#da5672',
      ma5Color: '#2586ff',
      ma10Color: '#8f5dff',
      ma20Color: '#ef9f1d',
    };
  }

  return {
    layout: {
      background: { color: '#07101d' },
      textColor: '#8eb1cf',
    },
    grid: {
      vertLines: { color: 'rgba(65, 110, 158, 0.18)' },
      horzLines: { color: 'rgba(65, 110, 158, 0.18)' },
    },
    crosshairColor: 'rgba(111, 181, 255, 0.3)',
    scaleBorderColor: 'rgba(79, 126, 179, 0.28)',
    candleUpColor: '#3ddc97',
    candleDownColor: '#ff6b7c',
    ma5Color: '#54a6ff',
    ma10Color: '#a67dff',
    ma20Color: '#ffbe55',
  };
}

function resolveKlineFromCrosshair(params: {
  param: MouseEventParams<Time>;
  klines: ReturnType<typeof useMarketStore.getState>['klines'];
}) {
  const { param, klines } = params;

  if (!param.point || param.time === undefined) {
    return klines[klines.length - 1] ?? null;
  }

  const hoveredTimestamp = typeof param.time === 'number' ? Math.round(param.time * 1000) : null;

  if (hoveredTimestamp === null) {
    return klines[klines.length - 1] ?? null;
  }

  return klines.find((item) => item.open_time === hoveredTimestamp) ?? klines[klines.length - 1] ?? null;
}

function normalizeChartVisibleRange(
  range: { from: Time; to: Time } | null,
) {
  if (!range) {
    return null;
  }

  const from = normalizeChartTimeValue(range.from);
  const to = normalizeChartTimeValue(range.to);

  if (from === null || to === null || from >= to) {
    return null;
  }

  return { from, to };
}

function normalizeChartTimeValue(time: Time | undefined): number | null {
  return typeof time === 'number' && Number.isFinite(time) ? time : null;
}
