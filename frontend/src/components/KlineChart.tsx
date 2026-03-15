import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
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
  isNearHistoryLoadEdge,
  resolveChartUpdateMode,
  resolveVisibleRangeAfterPrepend,
  shouldLoadOlderKlines,
  shouldShowDetachedRealtimePriceLine,
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
  const realtimePriceLineRef = useRef<IPriceLine | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema12SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema26SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdDIFSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdDEASeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const bollingerUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const chartDataRef = useRef<CandlestickData[]>([]);
  const latestPriceRef = useRef<number | null>(null);
  const latestKlineRef = useRef<Kline | null>(null);
  const visibleLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const themeRef = useRef<ThemeMode>('dark');
  const previousDataRef = useRef<CandlestickData[]>([]);
  const previousMarketKeyRef = useRef<string | null>(null);
  const isHistoryPagingReadyRef = useRef(false);
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
    latestPrice,
    indicatorSettings,
    updateIndicatorSetting,
    retryLoadOlderKlines,
    fundingRate,
    isLoadingFundingRate,
    fetchFundingRate,
    klineLoadState,
  } = useMarketStore();

  themeRef.current = theme;
  latestPriceRef.current = latestPrice;
  latestKlineRef.current = klines[klines.length - 1] ?? null;

  const syncDetachedRealtimePriceLine = React.useCallback((visibleToOverride?: number | null) => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      return;
    }

    const data = chartDataRef.current;
    const latestLogicalIndex = data.length > 0 ? data.length - 1 : null;
    const visibleTo = visibleToOverride
      ?? visibleLogicalRangeRef.current?.to
      ?? chartRef.current?.timeScale().getVisibleLogicalRange()?.to;

    const shouldShow = shouldShowDetachedRealtimePriceLine({
      latestPrice: latestPriceRef.current,
      latestLogicalIndex,
      visibleTo,
    });

    if (!shouldShow || typeof latestPriceRef.current !== 'number') {
      if (realtimePriceLineRef.current) {
        candleSeries.removePriceLine(realtimePriceLineRef.current);
        realtimePriceLineRef.current = null;
      }
      return;
    }

    const currentTheme = getChartTheme(themeRef.current);
    const latestKline = latestKlineRef.current;
    const isUp = latestKline ? latestPriceRef.current >= latestKline.open : true;
    const tone = isUp ? 'up' : 'down';
    const lineColor = tone === 'up' ? currentTheme.candleUpColor : currentTheme.candleDownColor;

    const options = {
      id: 'detached-realtime-price',
      price: latestPriceRef.current,
      color: lineColor,
      lineWidth: 1 as const,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      axisLabelColor: lineColor,
      axisLabelTextColor: themeRef.current === 'light' ? '#f8fbff' : '#07101d',
      title: '',
    };

    if (realtimePriceLineRef.current) {
      realtimePriceLineRef.current.applyOptions(options);
      return;
    }

    realtimePriceLineRef.current = candleSeries.createPriceLine(options);
  }, [interval, theme]);

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
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      rightPriceScale: {
        borderColor: initialTheme.scaleBorderColor,
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
        visible: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: initialTheme.candleUpColor,
      downColor: initialTheme.candleDownColor,
      borderVisible: false,
      wickUpColor: initialTheme.candleUpColor,
      wickDownColor: initialTheme.candleDownColor,
      priceScaleId: 'right',
    });
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: '#26a69a',
      lastValueVisible: false,
      priceLineVisible: false,
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

    // EMA 系列
    const ema12Series = chart.addLineSeries({
      color: initialTheme.ema12Color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema26Series = chart.addLineSeries({
      color: initialTheme.ema26Color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // RSI 系列（独立价格刻度）
    const rsiSeries = chart.addLineSeries({
      color: initialTheme.rsiColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: 'rsi',
    });

    // MACD 系列（独立价格刻度）
    const macdDIFSeries = chart.addLineSeries({
      color: initialTheme.macdDIFColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: 'macd',
    });
    const macdDEASeries = chart.addLineSeries({
      color: initialTheme.macdDEAColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: 'macd',
    });
    const macdHistogramSeries = chart.addHistogramSeries({
      priceScaleId: 'macd',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // 布林带系列
    const bollingerUpperSeries = chart.addLineSeries({
      color: initialTheme.bollingerUpperColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bollingerMiddleSeries = chart.addLineSeries({
      color: initialTheme.bollingerMiddleColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bollingerLowerSeries = chart.addLineSeries({
      color: initialTheme.bollingerLowerColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // 配置副图价格刻度 - Volume（底部）
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.75,
        bottom: 0,
      },
      visible: true,
      autoScale: true,
    });

    // 配置 RSI 刻度 (0-100)
    chart.priceScale('rsi').applyOptions({
      scaleMargins: {
        top: 0.7,
        bottom: 0.05,
      },
      visible: false,
      autoScale: false,
    });

    // 配置 MACD 刻度
    chart.priceScale('macd').applyOptions({
      scaleMargins: {
        top: 0.7,
        bottom: 0.05,
      },
      visible: false, // 默认隐藏，显示MACD时启用
      autoScale: true,
    });

    // 为主图价格轴设置边距
    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.25,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ma5SeriesRef.current = ma5Series;
    ma10SeriesRef.current = ma10Series;
    ma20SeriesRef.current = ma20Series;
    ema12SeriesRef.current = ema12Series;
    ema26SeriesRef.current = ema26Series;
    rsiSeriesRef.current = rsiSeries;
    macdDIFSeriesRef.current = macdDIFSeries;
    macdDEASeriesRef.current = macdDEASeries;
    macdHistogramSeriesRef.current = macdHistogramSeries;
    bollingerUpperSeriesRef.current = bollingerUpperSeries;
    bollingerMiddleSeriesRef.current = bollingerMiddleSeries;
    bollingerLowerSeriesRef.current = bollingerLowerSeries;
    previousDataRef.current = [];
    previousMarketKeyRef.current = null;
    isHistoryPagingReadyRef.current = false;
    chartDataRef.current = [];
    visibleLogicalRangeRef.current = null;

    const resizeChart = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: Math.max(chartContainerRef.current.clientHeight, MIN_CHART_HEIGHT),
        });
        syncDetachedRealtimePriceLine();
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
      visibleLogicalRangeRef.current = range;
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

      syncDetachedRealtimePriceLine(range?.to);
    };

    const handleVisibleTimeRangeChange = () => {
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
      isHistoryPagingReadyRef.current = false;
      previousDataRef.current = [];
      previousMarketKeyRef.current = null;
      chartDataRef.current = [];
      visibleLogicalRangeRef.current = null;
      if (realtimePriceLineRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.removePriceLine(realtimePriceLineRef.current);
      realtimePriceLineRef.current = null;
    }
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
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
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
    ema12SeriesRef.current?.applyOptions({ color: nextTheme.ema12Color });
    ema26SeriesRef.current?.applyOptions({ color: nextTheme.ema26Color });
    rsiSeriesRef.current?.applyOptions({ color: nextTheme.rsiColor });
    macdDIFSeriesRef.current?.applyOptions({ color: nextTheme.macdDIFColor });
    macdDEASeriesRef.current?.applyOptions({ color: nextTheme.macdDEAColor });
    bollingerUpperSeriesRef.current?.applyOptions({ color: nextTheme.bollingerUpperColor });
    bollingerMiddleSeriesRef.current?.applyOptions({ color: nextTheme.bollingerMiddleColor });
    bollingerLowerSeriesRef.current?.applyOptions({ color: nextTheme.bollingerLowerColor });
    syncDetachedRealtimePriceLine();
  }, [theme, isCrosshairMagnetEnabled]);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const marketKey = `${exchange}:${symbol}:${interval}`;
    const isMarketChange = previousMarketKeyRef.current !== marketKey;

    if (klines.length === 0) {
      if (isMarketChange) {
        candleSeriesRef.current.setData([]);
        syncIndicatorSeries({
          klines: [],
          settings: indicatorSettings,
          series: {
            volume: volumeSeriesRef.current,
            ma5: ma5SeriesRef.current,
            ma10: ma10SeriesRef.current,
            ma20: ma20SeriesRef.current,
            ema12: ema12SeriesRef.current,
            ema26: ema26SeriesRef.current,
            rsi: rsiSeriesRef.current,
            macdDIF: macdDIFSeriesRef.current,
            macdDEA: macdDEASeriesRef.current,
            macdHistogram: macdHistogramSeriesRef.current,
            bollingerUpper: bollingerUpperSeriesRef.current,
            bollingerMiddle: bollingerMiddleSeriesRef.current,
            bollingerLower: bollingerLowerSeriesRef.current,
          },
        });
        previousDataRef.current = [];
        previousMarketKeyRef.current = marketKey;
        isHistoryPagingReadyRef.current = false;
        chartDataRef.current = [];
        syncDetachedRealtimePriceLine();
      }
      return;
    }

    const data = buildCandlestickData(klines);
    chartDataRef.current = data;
    const previousData = previousDataRef.current;
    const nextLast = data[data.length - 1];

    const isInitialLoad = previousData.length === 0;
    const isSignificantDataGrowth = data.length >= 50 && previousData.length < 50;

    const updateMode = isInitialLoad || isMarketChange || isSignificantDataGrowth
      ? 'replace'
      : resolveChartUpdateMode({
          previousData,
          nextData: data,
          previousMarketKey: previousMarketKeyRef.current,
          nextMarketKey: marketKey,
        });

    if (updateMode === 'replace') {
      isHistoryPagingReadyRef.current = false;

      candleSeriesRef.current.setData(data);

      const visibleBars = Math.min(data.length, MIN_DEFAULT_VISIBLE_BARS);
      const startIndex = Math.max(0, data.length - visibleBars);
      chartRef.current?.timeScale().setVisibleLogicalRange({
        from: startIndex,
        to: data.length - 1 + DEFAULT_RIGHT_PADDING_BARS,
      });

      // 数据加载完成后先启用自动缩放，确保价格刻度正确显示
      candleSeriesRef.current.priceScale().applyOptions({
        autoScale: true,
      });

      // 然后禁用自动缩放，允许用户自由拖动
      chartRef.current?.applyOptions({
        rightPriceScale: {
          autoScale: false,
        },
      });

      isHistoryPagingReadyRef.current = true;
    } else if (updateMode === 'prepend') {
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      const prependedCount = data.length - previousData.length;
      const nextVisibleRange = resolveVisibleRangeAfterPrepend({
        visibleRange,
        prependedCount,
        keepPinnedToLeftEdge: isNearHistoryLoadEdge(visibleRange?.from),
      });

      candleSeriesRef.current.setData(data);

      if (nextVisibleRange && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange(nextVisibleRange);
      }
    } else if (updateMode === 'repair') {
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      const addedCount = data.length - previousData.length;
      const previousLastLogical = previousData.length - 1;
      const isNearRealtime = Boolean(
        visibleRange &&
        previousLastLogical >= 0 &&
        visibleRange.to >= previousLastLogical - 5
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
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      if (visibleRange) {
        const rangeWidth = visibleRange.to - visibleRange.from;
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
        ema12: ema12SeriesRef.current,
        ema26: ema26SeriesRef.current,
        rsi: rsiSeriesRef.current,
        macdDIF: macdDIFSeriesRef.current,
        macdDEA: macdDEASeriesRef.current,
        macdHistogram: macdHistogramSeriesRef.current,
        bollingerUpper: bollingerUpperSeriesRef.current,
        bollingerMiddle: bollingerMiddleSeriesRef.current,
        bollingerLower: bollingerLowerSeriesRef.current,
      },
    });

    // 控制副图 price scale 可见性
    if (chartRef.current) {
      chartRef.current.priceScale('rsi').applyOptions({ visible: indicatorSettings.rsi });
      chartRef.current.priceScale('macd').applyOptions({ visible: indicatorSettings.macd });
    }

    previousDataRef.current = data;
    previousMarketKeyRef.current = marketKey;
    syncDetachedRealtimePriceLine();
  }, [klines, exchange, symbol, interval, indicatorSettings]);

  useEffect(() => {
    syncDetachedRealtimePriceLine();
  }, [latestPrice]);

  useEffect(() => {
    setHoveredKline(null);
  }, [exchange, symbol, interval]);

  useEffect(() => {
    void fetchFundingRate();
  }, [exchange, symbol]);

  const legendItems = buildIndicatorLegend(klines, indicatorSettings);
  const activeKline = hoveredKline ?? klines[klines.length - 1] ?? null;
  const activeSnapshot = buildInspectorSnapshot(activeKline);
  const inspectorMarketLabel = `${formatMarketSymbol(symbol)} · ${formatChartIntervalLabel(interval)} · ${exchange.toUpperCase()}`;
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
        {/* 成交量副图背景区域 */}
        <div className="chart-panel__volume-bg" aria-hidden="true" />
        {!isLoadingKlines ? (
          <>
            <div className="chart-panel__hud chart-panel__hud--terminal">
              <ChartInspector
                marketLabel={inspectorMarketLabel}
                snapshot={activeSnapshot}
                fundingRate={fundingRate}
                isLoadingFundingRate={isLoadingFundingRate}
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
                <span className="chart-volume-legend__label">{'成交量 (Volume)'}</span>
                <span className="chart-volume-legend__value">
                  {formatChartVolumeLegendValue(activeKline.volume)}
                </span>
              </div>
            ) : null}

            {isLoadingOlderKlines ? (
              <div
                className="chart-history-edge chart-history-edge--loading"
                role="status"
                aria-live="polite"
                aria-label="正在加载更多历史K线"
              >
                <span className="chart-history-edge__rail" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} className="chart-history-edge__beam" />
                  ))}
                </span>
                <span className="chart-history-edge__meta">
                  <span className="chart-history-edge__label">{'加载历史'}</span>
                </span>
              </div>
            ) : null}

            {!isLoadingOlderKlines && olderKlineLoadError ? (
              <div className="chart-history-edge chart-history-edge--error" role="alert" aria-live="assertive">
                <span className="chart-history-edge__rail chart-history-edge__rail--error" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="chart-history-edge__beam chart-history-edge__beam--error" />
                  ))}
                </span>
                <span className="chart-history-edge__meta">
                  <span className="chart-history-edge__label chart-history-edge__label--error">{'加载失败'}</span>
                  <button
                    type="button"
                    className="chart-history-edge__retry"
                    aria-label="重试加载历史K线"
                    title={olderKlineLoadError}
                    onClick={() => {
                      void retryLoadOlderKlines();
                    }}
                  >
                    重试
                  </button>
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        <div
          ref={chartContainerRef}
          data-testid="kline-chart"
          className={`chart-canvas ${(isLoadingKlines || klineLoadState === 'loading') ? 'chart-canvas--dimmed' : ''}`}
        />

        {klineLoadState === 'loading' ? (
          <div className="chart-overlay chart-overlay--loading">
            <div className="chart-loading-signal" aria-hidden="true">
              {LOADING_SIGNAL_BARS.map((barIndex) => (
                <span key={barIndex} className="chart-loading-signal__bar" />
              ))}
            </div>
            <div className="chart-loading-text">
              <span className="chart-loading-text__title">正在加载行情数据</span>
              <span className="chart-loading-text__subtitle">
                正在从 {exchange.toUpperCase()} 获取 {symbol} K 线数据...
              </span>
            </div>
          </div>
        ) : klineLoadState === 'error' ? (
          <div className="chart-overlay chart-overlay--error">
            <div className="chart-error-icon" aria-hidden="true">!</div>
            <div className="chart-loading-text">
              <span className="chart-loading-text__title chart-loading-text__title--error">数据加载失败</span>
              <span className="chart-loading-text__subtitle">
                无法从 {exchange.toUpperCase()} 获取数据，请检查网络连接或切换其他市场
              </span>
            </div>
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
      ema12Color: '#ff6b6b',
      ema26Color: '#4ecdc4',
      rsiColor: '#9b59b6',
      macdDIFColor: '#3498db',
      macdDEAColor: '#e74c3c',
      bollingerUpperColor: 'rgba(46, 204, 113, 0.8)',
      bollingerMiddleColor: 'rgba(46, 204, 113, 0.5)',
      bollingerLowerColor: 'rgba(46, 204, 113, 0.8)',
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
    ema12Color: '#ff6b6b',
    ema26Color: '#4ecdc4',
    rsiColor: '#9b59b6',
    macdDIFColor: '#3498db',
    macdDEAColor: '#e74c3c',
    bollingerUpperColor: 'rgba(46, 204, 113, 0.8)',
    bollingerMiddleColor: 'rgba(46, 204, 113, 0.5)',
    bollingerLowerColor: 'rgba(46, 204, 113, 0.8)',
  };
}

function resolveKlineFromCrosshair(params: {
  param: MouseEventParams<Time>;
  klines: Kline[];
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
