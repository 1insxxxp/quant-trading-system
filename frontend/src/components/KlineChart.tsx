import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
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
import { Toolbar } from './Toolbar';
import {
  buildCandlestickData,
  resolveChartUpdateMode,
  shouldLoadOlderKlines,
} from './klineChartData';
import { buildIndicatorLegend, syncIndicatorSeries } from './klineChartIndicators';
import type { Kline } from '../types';

const MIN_CHART_HEIGHT = 460;
const MIN_DEFAULT_VISIBLE_BARS = 80;
const DEFAULT_RIGHT_PADDING_BARS = 6;
const LOADING_SIGNAL_BARS = Array.from({ length: 12 }, (_, index) => index);

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
  const isCrosshairMagnetEnabled = useUiStore((state) => state.isCrosshairMagnetEnabled);

  const {
    klines,
    exchange,
    symbol,
    interval,
    isLoadingKlines,
    isLoadingOlderKlines,
    olderKlineLoadError,
    indicatorSettings,
    updateIndicatorSetting,
    retryLoadOlderKlines,
  } = useMarketStore();

  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const initialTheme = getChartTheme(theme);
    const containerHeight = chartContainerRef.current.clientHeight;
    const initialHeight = containerHeight > 0 ? containerHeight : MIN_CHART_HEIGHT;
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 800,
      height: initialHeight,
      layout: initialTheme.layout,
      grid: initialTheme.grid,
      crosshair: {
        mode: isCrosshairMagnetEnabled ? 1 : 0,
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
    previousMarketKeyRef.current = null;
    isHistoryPagingReadyRef.current = false;

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
      const state = useMarketStore.getState();
      const shouldLoad = shouldLoadOlderKlines({
        visibleFrom: range?.from,
        isLoadingOlderKlines: state.isLoadingOlderKlines,
        hasMoreHistoricalKlines: state.hasMoreHistoricalKlines,
        isHistoryPagingReady: isHistoryPagingReadyRef.current,
        hasOlderLoadError: Boolean(state.olderKlineLoadError),
      });

      if (shouldLoad) {
        void state.loadOlderKlines();
      }
    };

    const handleVisibleTimeRangeChange = (
      range: { from: Time; to: Time } | null,
    ) => {
      // Chart view state persistence removed
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
      previousMarketKeyRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const nextTheme = getChartTheme(theme);

    chartRef.current?.applyOptions({
      layout: nextTheme.layout,
      grid: nextTheme.grid,
      crosshair: {
        mode: isCrosshairMagnetEnabled ? 1 : 0,
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
  }, [theme, isCrosshairMagnetEnabled]);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const marketKey = `${exchange}:${symbol}:${interval}`;

    if (klines.length === 0) {
      // Do not clear chart data when klines is empty - this causes flickering
      // Just skip update and wait for data to arrive
      return;
    }

    const data = buildCandlestickData(klines, interval);
    const previousData = previousDataRef.current;
    const nextLast = data[data.length - 1];

    // Force replace mode on initial load, market change, or when data size grows significantly
    const isInitialLoad = previousData.length === 0;
    const isMarketChange = previousMarketKeyRef.current !== marketKey;
    const isDataGrowth = data.length > previousData.length * 1.5;

    const updateMode = isInitialLoad || isMarketChange || isDataGrowth
      ? 'replace'
      : resolveChartUpdateMode({
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

      // Force chart to show correct number of bars
      chartRef.current?.timeScale().fitContent();

      // Set explicit visible range to show the latest bars
      const visibleBars = Math.min(data.length, MIN_DEFAULT_VISIBLE_BARS);
      const startIndex = Math.max(0, data.length - visibleBars);
      chartRef.current?.timeScale().setVisibleLogicalRange({
        from: startIndex,
        to: data.length - 1 + DEFAULT_RIGHT_PADDING_BARS,
      });

      isHistoryPagingReadyRef.current = true;
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
    } else if (updateMode === 'update-last' && nextLast) {
      candleSeriesRef.current.update(nextLast);
      // Ensure visible range is set correctly when chart might be zoomed in too far
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      if (visibleRange) {
        const rangeWidth = visibleRange.to - visibleRange.from;
        // If visible range is too narrow (showing only a few bars), reset it
        if (rangeWidth < 10) {
          const visibleBars = Math.min(data.length, MIN_DEFAULT_VISIBLE_BARS);
          const startIndex = Math.max(0, data.length - visibleBars);
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: startIndex,
            to: data.length - 1 + DEFAULT_RIGHT_PADDING_BARS,
          });
        }
      }
    } else if (updateMode === 'append' && nextLast) {
      candleSeriesRef.current.update(nextLast);
      chartRef.current?.timeScale().scrollToRealTime();
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
  const inspectorMarketLabel = `${formatMarketSymbol(symbol)} \u00b7 ${formatChartIntervalLabel(interval)} \u00b7 ${exchange.toUpperCase()}`;
  const activeDirection =
    activeSnapshot === null ? 'flat' : activeSnapshot.change > 0 ? 'up' : activeSnapshot.change < 0 ? 'down' : 'flat';

  return (
    <section className="chart-panel chart-workspace">
      <div className="chart-workspace__header chart-workspace__header--terminal">
        <div className="chart-workspace__header-main">
          <Toolbar
            indicatorSettings={indicatorSettings}
            onToggleIndicator={(indicatorId, enabled) => {
              void updateIndicatorSetting(indicatorId, enabled);
            }}
          />
        </div>
      </div>

      <div className={`chart-panel__body ${isLoadingKlines ? 'chart-panel__body--loading' : ''}`}>
        <div className="chart-panel__body-frame" />
        {!isLoadingKlines ? (
          <>
            <div className="chart-panel__hud chart-panel__hud--terminal">
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
                <span className="chart-volume-legend__label">{'\u6210\u4ea4\u91cf (Volume)'}</span>
                <span className="chart-volume-legend__value">
                  {formatChartVolumeLegendValue(activeKline.volume)}
                </span>
              </div>
            ) : null}

            {isLoadingOlderKlines ? (
              <div className="chart-history-status chart-history-status--loading" role="status" aria-live="polite">
                <span className="chart-history-status__signal" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="chart-history-status__signal-bar" />
                  ))}
                </span>
                <span>{'\u6b63\u5728\u52a0\u8f7d\u66f4\u65e9\u5386\u53f2 K \u7ebf...'}</span>
              </div>
            ) : null}

            {!isLoadingOlderKlines && olderKlineLoadError ? (
              <div className="chart-history-status chart-history-status--error" role="alert" aria-live="assertive">
                <span>{olderKlineLoadError}</span>
                <button
                  type="button"
                  className="chart-history-status__retry"
                  onClick={() => {
                    void retryLoadOlderKlines();
                  }}
                >
                  {'重试'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        <div
          ref={chartContainerRef}
          data-testid="kline-chart"
          className={`chart-canvas ${isLoadingKlines ? 'chart-canvas--dimmed' : ''}`}
        />

        {isLoadingKlines ? (
          <div className="chart-overlay chart-overlay--loading">
            <div className="chart-loading-signal" aria-hidden="true">
              {LOADING_SIGNAL_BARS.map((barIndex) => (
                <span key={barIndex} className="chart-loading-signal__bar" />
              ))}
            </div>
            <strong>{'\u6b63\u5728\u52a0\u8f7d K \u7ebf\u6570\u636e...'}</strong>
            <span>{'\u5207\u6362\u5df2\u751f\u6548\uff0c\u5386\u53f2\u6570\u636e\u8fd4\u56de\u540e\u4f1a\u81ea\u52a8\u66f4\u65b0\u5f53\u524d\u56fe\u8868\u3002'}</span>
          </div>
        ) : null}

        {!isLoadingKlines && klines.length === 0 ? (
          <div className="chart-overlay">
            <strong>{'\u7b49\u5f85\u5e02\u573a\u6570\u636e'}</strong>
            <span>{'\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u53ef\u7528 K \u7ebf\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u5207\u6362\u5e02\u573a\u3002'}</span>
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

function applyDefaultVisibleRange(chart: IChartApi | null, data: CandlestickData[], interval: string) {
  if (!chart || data.length === 0) {
    return;
  }

  const visibleBars = Math.min(data.length, MIN_DEFAULT_VISIBLE_BARS);
  const startIndex = Math.max(0, data.length - visibleBars);
  const endIndex = Math.max(startIndex, data.length - 1);

  chart.timeScale().setVisibleLogicalRange({
    from: startIndex,
    to: endIndex + DEFAULT_RIGHT_PADDING_BARS,
  });
}
