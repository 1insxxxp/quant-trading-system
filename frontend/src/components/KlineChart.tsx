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
import { buildIndicatorLegend } from './klineChartIndicators';
import type { Kline } from '../types';

const MIN_CHART_HEIGHT = 460;
const MIN_DEFAULT_VISIBLE_BARS = 80;
const DEFAULT_RIGHT_PADDING_BARS = 6;
const LOADING_SIGNAL_BARS = Array.from({ length: 12 }, (_, index) => index);

// 副图高度配置
const SUB_CHART_HEIGHT = 120; // 每个副图高度
const MAIN_CHART_RATIO = 0.65; // 主图占可用高度的比例

export const KlineChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // 主图 refs
  const mainChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const realtimePriceLineRef = useRef<IPriceLine | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema12SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema26SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // 成交量副图 refs
  const volumeChartRef = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // RSI 副图 refs
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiUpperBandRef = useRef<IPriceLine | null>(null);
  const rsiLowerBandRef = useRef<IPriceLine | null>(null);

  // MACD 副图 refs
  const macdChartRef = useRef<IChartApi | null>(null);
  const macdDIFSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdDEASeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdZeroLineRef = useRef<IPriceLine | null>(null);

  const chartDataRef = useRef<CandlestickData[]>([]);
  const latestPriceRef = useRef<number | null>(null);
  const latestKlineRef = useRef<Kline | null>(null);
  const visibleLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const themeRef = useRef<ThemeMode>('dark');
  const previousDataRef = useRef<CandlestickData[]>([]);
  const previousMarketKeyRef = useRef<string | null>(null);
  const isHistoryPagingReadyRef = useRef(false);
  const isSyncingTimeScaleRef = useRef(false);
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

  // 同步时间轴的函数
  const syncTimeScale = (sourceChart: IChartApi, targetCharts: IChartApi[]) => {
    if (isSyncingTimeScaleRef.current) return;
    isSyncingTimeScaleRef.current = true;

    try {
      const visibleRange = sourceChart.timeScale().getVisibleLogicalRange();
      if (visibleRange) {
        targetCharts.forEach(chart => {
          if (chart) {
            try {
              chart.timeScale().setVisibleLogicalRange(visibleRange);
            } catch {
              // Chart may be disposed, ignore
            }
          }
        });
      }
    } catch {
      // Source chart may be disposed, ignore
    }

    isSyncingTimeScaleRef.current = false;
  };

  const syncDetachedRealtimePriceLine = React.useCallback((visibleToOverride?: number | null) => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    try {
      const data = chartDataRef.current;
      const latestLogicalIndex = data.length > 0 ? data.length - 1 : null;
      const visibleTo = visibleToOverride
        ?? visibleLogicalRangeRef.current?.to
        ?? mainChartRef.current?.timeScale().getVisibleLogicalRange()?.to;

      const shouldShow = shouldShowDetachedRealtimePriceLine({
        latestPrice: latestPriceRef.current,
        latestLogicalIndex,
        visibleTo,
      });

      if (!shouldShow || typeof latestPriceRef.current !== 'number') {
        if (realtimePriceLineRef.current) {
          try {
            candleSeries.removePriceLine(realtimePriceLineRef.current);
          } catch {
            // Series may be disposed, ignore
          }
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
        try {
          realtimePriceLineRef.current.applyOptions(options);
        } catch {
          // Price line may be disposed, recreate it
          realtimePriceLineRef.current = null;
        }
        if (realtimePriceLineRef.current) return;
      }

      realtimePriceLineRef.current = candleSeries.createPriceLine(options);
    } catch {
      // Chart or series may be disposed, ignore
    }
  }, [interval, theme]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const initialTheme = getChartTheme(theme);
    const containerHeight = chartContainerRef.current.clientHeight;
    const totalHeight = containerHeight > 0 ? containerHeight : MIN_CHART_HEIGHT;

    // 计算各图表高度
    const hasVolume = indicatorSettings.volume;
    const hasRSI = indicatorSettings.rsi;
    const hasMACD = indicatorSettings.macd;
    const subChartCount = (hasVolume ? 1 : 0) + (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
    const subChartsTotalHeight = subChartCount * SUB_CHART_HEIGHT;
    const mainChartHeight = Math.max(totalHeight * MAIN_CHART_RATIO, totalHeight - subChartsTotalHeight - 40);
    const actualSubChartHeight = subChartCount > 0 ? (totalHeight - mainChartHeight - 40) / subChartCount : 0;

    // 创建主图
    const mainChart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 800,
      height: mainChartHeight,
      layout: initialTheme.layout,
      grid: initialTheme.grid,
      crosshair: {
        mode: isCrosshairMagnetEnabled ? 1 : 0,
        vertLine: { color: initialTheme.crosshairColor },
        horzLine: { color: initialTheme.crosshairColor },
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
        lockVisibleTimeRange: false,
      },
      rightPriceScale: {
        borderColor: initialTheme.scaleBorderColor,
        autoScale: true,
        autoScaleMargin: 8,
        scaleMargins: { top: 0.05, bottom: 0.05 },
        visible: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: false, price: true },
        axisDoubleClickReset: { time: false, price: true },
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    const candleSeries = mainChart.addCandlestickSeries({
      upColor: initialTheme.candleUpColor,
      downColor: initialTheme.candleDownColor,
      borderVisible: false,
      wickUpColor: initialTheme.candleUpColor,
      wickDownColor: initialTheme.candleDownColor,
    });

    // MA 系列
    const ma5Series = mainChart.addLineSeries({
      color: initialTheme.ma5Color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma10Series = mainChart.addLineSeries({
      color: initialTheme.ma10Color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma20Series = mainChart.addLineSeries({
      color: initialTheme.ma20Color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // EMA 系列
    const ema12Series = mainChart.addLineSeries({
      color: initialTheme.ema12Color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema26Series = mainChart.addLineSeries({
      color: initialTheme.ema26Color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // 布林带系列
    const bollingerUpperSeries = mainChart.addLineSeries({
      color: initialTheme.bollingerUpperColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bollingerMiddleSeries = mainChart.addLineSeries({
      color: initialTheme.bollingerMiddleColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bollingerLowerSeries = mainChart.addLineSeries({
      color: initialTheme.bollingerLowerColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    mainChartRef.current = mainChart;
    candleSeriesRef.current = candleSeries;
    ma5SeriesRef.current = ma5Series;
    ma10SeriesRef.current = ma10Series;
    ma20SeriesRef.current = ma20Series;
    ema12SeriesRef.current = ema12Series;
    ema26SeriesRef.current = ema26Series;
    bollingerUpperSeriesRef.current = bollingerUpperSeries;
    bollingerMiddleSeriesRef.current = bollingerMiddleSeries;
    bollingerLowerSeriesRef.current = bollingerLowerSeries;

    // 创建副图容器
    const subCharts: IChartApi[] = [];

    // 成交量副图
    if (hasVolume) {
      const volumeChart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 800,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' }, // 隐藏水平网格线
        },
        crosshair: {
          mode: 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: false },
        },
        timeScale: {
          visible: false, // 隐藏时间轴
          borderVisible: false,
        },
        rightPriceScale: {
          borderColor: initialTheme.scaleBorderColor,
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          visible: true,
        },
        handleScale: {
          axisPressedMouseMove: { time: false, price: true },
          mouseWheel: false, // 禁用滚轮缩放
          pinch: false,
        },
        handleScroll: {
          axisPressedMouseMove: { time: false, price: false },
          mouseWheel: false,
          pressedMouseMove: false,
        },
      });

      const volumeSeries = volumeChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        color: '#26a69a',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      volumeChartRef.current = volumeChart;
      volumeSeriesRef.current = volumeSeries;
      subCharts.push(volumeChart);
    }

    // RSI 副图
    if (hasRSI) {
      const rsiChart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 800,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: false },
        },
        timeScale: {
          visible: false,
          borderVisible: false,
        },
        rightPriceScale: {
          borderColor: initialTheme.scaleBorderColor,
          autoScale: false,
          minValue: 0,
          maxValue: 100,
          scaleMargins: { top: 0.05, bottom: 0.05 },
          visible: true,
        },
        handleScale: {
          axisPressedMouseMove: { time: false, price: false },
          mouseWheel: false,
          pinch: false,
        },
        handleScroll: {
          axisPressedMouseMove: { time: false, price: false },
          mouseWheel: false,
          pressedMouseMove: false,
        },
      });

      const rsiSeries = rsiChart.addLineSeries({
        color: initialTheme.rsiColor,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      // 添加 30/70 参考线
      rsiUpperBandRef.current = rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(150, 150, 150, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: false,
      });
      rsiLowerBandRef.current = rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(150, 150, 150, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: false,
      });

      rsiChartRef.current = rsiChart;
      rsiSeriesRef.current = rsiSeries;
      subCharts.push(rsiChart);
    }

    // MACD 副图
    if (hasMACD) {
      const macdChart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 800,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: false },
        },
        timeScale: {
          visible: false,
          borderVisible: false,
        },
        rightPriceScale: {
          borderColor: initialTheme.scaleBorderColor,
          autoScale: true,
          scaleMargins: { top: 0.2, bottom: 0.2 },
          visible: true,
        },
        handleScale: {
          axisPressedMouseMove: { time: false, price: false },
          mouseWheel: false,
          pinch: false,
        },
        handleScroll: {
          axisPressedMouseMove: { time: false, price: false },
          mouseWheel: false,
          pressedMouseMove: false,
        },
      });

      const macdHistogramSeries = macdChart.addHistogramSeries({
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const macdDIFSeries = macdChart.addLineSeries({
        color: initialTheme.macdDIFColor,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const macdDEASeries = macdChart.addLineSeries({
        color: initialTheme.macdDEAColor,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      // 零线
      macdZeroLineRef.current = macdDEASeries.createPriceLine({
        price: 0,
        color: 'rgba(150, 150, 150, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        lineVisible: true,
        axisLabelVisible: false,
      });

      macdChartRef.current = macdChart;
      macdHistogramSeriesRef.current = macdHistogramSeries;
      macdDIFSeriesRef.current = macdDIFSeries;
      macdDEASeriesRef.current = macdDEASeries;
      subCharts.push(macdChart);
    }

    // 同步时间轴
    const handleMainTimeScaleChange = () => {
      syncTimeScale(mainChart, subCharts);
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleMainTimeScaleChange);

    const resizeChart = () => {
      if (chartContainerRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        const newTotalHeight = Math.max(chartContainerRef.current.clientHeight, MIN_CHART_HEIGHT);

        const newSubChartCount = subCharts.length;
        const newSubChartsTotalHeight = newSubChartCount * SUB_CHART_HEIGHT;
        const newMainChartHeight = Math.max(newTotalHeight * MAIN_CHART_RATIO, newTotalHeight - newSubChartsTotalHeight - 40);
        const newActualSubChartHeight = newSubChartCount > 0 ? (newTotalHeight - newMainChartHeight - 40) / newSubChartCount : 0;

        mainChart.applyOptions({ width: newWidth, height: newMainChartHeight });
        subCharts.forEach(chart => {
          chart.applyOptions({ width: newWidth, height: newActualSubChartHeight });
        });
        syncDetachedRealtimePriceLine();
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resizeChart())
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

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      setHoveredKline(resolveKlineFromCrosshair({
        param,
        klines: useMarketStore.getState().klines,
      }));
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
    mainChart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeChart);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleMainTimeScaleChange);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
      mainChart.unsubscribeCrosshairMove(handleCrosshairMove);

      // Clear price line refs before removing charts
      rsiUpperBandRef.current = null;
      rsiLowerBandRef.current = null;
      macdZeroLineRef.current = null;
      realtimePriceLineRef.current = null;

      subCharts.forEach(chart => chart.remove());
      mainChart.remove();

      mainChartRef.current = null;
      volumeChartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
    };
  }, [exchange, symbol, interval, indicatorSettings.volume, indicatorSettings.rsi, indicatorSettings.macd]);

  useEffect(() => {
    const nextTheme = getChartTheme(theme);

    mainChartRef.current?.applyOptions({
      layout: nextTheme.layout,
      grid: nextTheme.grid,
      crosshair: {
        mode: isCrosshairMagnetEnabled ? 1 : 0,
        vertLine: { color: nextTheme.crosshairColor },
        horzLine: { color: nextTheme.crosshairColor },
      },
      timeScale: { borderColor: nextTheme.scaleBorderColor },
      rightPriceScale: { borderColor: nextTheme.scaleBorderColor },
    });

    [volumeChartRef.current, rsiChartRef.current, macdChartRef.current].forEach(chart => {
      chart?.applyOptions({
        layout: nextTheme.layout,
        grid: { ...nextTheme.grid, horzLines: { color: 'transparent' } },
        crosshair: {
          vertLine: { color: nextTheme.crosshairColor },
          horzLine: { visible: false },
        },
        rightPriceScale: { borderColor: nextTheme.scaleBorderColor },
      });
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
    if (!candleSeriesRef.current) return;

    const marketKey = `${exchange}:${symbol}:${interval}`;
    const isMarketChange = previousMarketKeyRef.current !== marketKey;

    if (klines.length === 0) {
      if (isMarketChange) {
        candleSeriesRef.current.setData([]);
        ma5SeriesRef.current?.setData([]);
        ma10SeriesRef.current?.setData([]);
        ma20SeriesRef.current?.setData([]);
        ema12SeriesRef.current?.setData([]);
        ema26SeriesRef.current?.setData([]);
        rsiSeriesRef.current?.setData([]);
        macdDIFSeriesRef.current?.setData([]);
        macdDEASeriesRef.current?.setData([]);
        macdHistogramSeriesRef.current?.setData([]);
        bollingerUpperSeriesRef.current?.setData([]);
        bollingerMiddleSeriesRef.current?.setData([]);
        bollingerLowerSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
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
      mainChartRef.current?.timeScale().setVisibleLogicalRange({
        from: startIndex,
        to: data.length - 1 + DEFAULT_RIGHT_PADDING_BARS,
      });

      candleSeriesRef.current.priceScale().applyOptions({ autoScale: true });
      mainChartRef.current?.applyOptions({ rightPriceScale: { autoScale: false } });
      isHistoryPagingReadyRef.current = true;
    } else if (updateMode === 'prepend') {
      const visibleRange = mainChartRef.current?.timeScale().getVisibleLogicalRange();
      const prependedCount = data.length - previousData.length;
      const nextVisibleRange = resolveVisibleRangeAfterPrepend({
        visibleRange,
        prependedCount,
        keepPinnedToLeftEdge: isNearHistoryLoadEdge(visibleRange?.from),
      });

      candleSeriesRef.current.setData(data);
      if (nextVisibleRange && mainChartRef.current) {
        mainChartRef.current.timeScale().setVisibleLogicalRange(nextVisibleRange);
      }
    } else if (updateMode === 'repair') {
      const visibleRange = mainChartRef.current?.timeScale().getVisibleLogicalRange();
      const addedCount = data.length - previousData.length;
      const previousLastLogical = previousData.length - 1;
      const isNearRealtime = Boolean(
        visibleRange && previousLastLogical >= 0 && visibleRange.to >= previousLastLogical - 5
      );

      candleSeriesRef.current.setData(data);
      if (isNearRealtime) {
        mainChartRef.current?.timeScale().scrollToRealTime();
      } else if (visibleRange && mainChartRef.current) {
        mainChartRef.current.timeScale().setVisibleLogicalRange({
          from: visibleRange.from,
          to: visibleRange.to + Math.max(0, addedCount),
        });
      }
    } else if (updateMode === 'update-last' && nextLast) {
      candleSeriesRef.current.update(nextLast);
    } else if (updateMode === 'append' && nextLast) {
      candleSeriesRef.current.update(nextLast);
      mainChartRef.current?.timeScale().scrollToRealTime();
    }

    // 同步指标数据
    syncIndicators(klines, indicatorSettings);

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

  // 同步所有指标数据
  const syncIndicators = (klines: Kline[], settings: typeof indicatorSettings) => {
    // MA
    if (settings.ma5 && ma5SeriesRef.current) {
      const ma5Data = calculateMA(klines, 5);
      ma5SeriesRef.current.setData(ma5Data);
    } else {
      ma5SeriesRef.current?.setData([]);
    }
    if (settings.ma10 && ma10SeriesRef.current) {
      const ma10Data = calculateMA(klines, 10);
      ma10SeriesRef.current.setData(ma10Data);
    } else {
      ma10SeriesRef.current?.setData([]);
    }
    if (settings.ma20 && ma20SeriesRef.current) {
      const ma20Data = calculateMA(klines, 20);
      ma20SeriesRef.current.setData(ma20Data);
    } else {
      ma20SeriesRef.current?.setData([]);
    }

    // EMA
    if (settings.ema12 && ema12SeriesRef.current) {
      const ema12Data = calculateEMA(klines, 12);
      ema12SeriesRef.current.setData(ema12Data);
    } else {
      ema12SeriesRef.current?.setData([]);
    }
    if (settings.ema26 && ema26SeriesRef.current) {
      const ema26Data = calculateEMA(klines, 26);
      ema26SeriesRef.current.setData(ema26Data);
    } else {
      ema26SeriesRef.current?.setData([]);
    }

    // Volume
    if (settings.volume && volumeSeriesRef.current) {
      const volumeData = klines.map(k => ({
        time: k.open_time / 1000 as Time,
        value: k.volume,
        color: k.close >= k.open ? '#26a69a' : '#ef5350',
      }));
      volumeSeriesRef.current.setData(volumeData);
    } else {
      volumeSeriesRef.current?.setData([]);
    }

    // RSI
    if (settings.rsi && rsiSeriesRef.current) {
      const rsiData = calculateRSI(klines, 14);
      rsiSeriesRef.current.setData(rsiData);
    } else {
      rsiSeriesRef.current?.setData([]);
    }

    // MACD
    if (settings.macd && macdDIFSeriesRef.current && macdDEASeriesRef.current && macdHistogramSeriesRef.current) {
      const macdData = calculateMACD(klines);
      macdDIFSeriesRef.current.setData(macdData.dif);
      macdDEASeriesRef.current.setData(macdData.dea);
      macdHistogramSeriesRef.current.setData(macdData.histogram);
    } else {
      macdDIFSeriesRef.current?.setData([]);
      macdDEASeriesRef.current?.setData([]);
      macdHistogramSeriesRef.current?.setData([]);
    }

    // Bollinger Bands
    if (settings.bollinger && bollingerUpperSeriesRef.current && bollingerMiddleSeriesRef.current && bollingerLowerSeriesRef.current) {
      const bbData = calculateBollinger(klines);
      bollingerUpperSeriesRef.current.setData(bbData.upper);
      bollingerMiddleSeriesRef.current.setData(bbData.middle);
      bollingerLowerSeriesRef.current.setData(bbData.lower);
    } else {
      bollingerUpperSeriesRef.current?.setData([]);
      bollingerMiddleSeriesRef.current?.setData([]);
      bollingerLowerSeriesRef.current?.setData([]);
    }
  };

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
          style={{ display: 'flex', flexDirection: 'column' }}
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

// 指标计算函数
function calculateMA(klines: Kline[], period: number) {
  const result = [];
  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += klines[i - j].close;
    }
    result.push({
      time: klines[i].open_time / 1000 as Time,
      value: sum / period,
    });
  }
  return result;
}

function calculateEMA(klines: Kline[], period: number) {
  const result = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) continue;

    if (i === period - 1) {
      // 第一个 EMA 使用 SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += klines[i - j].close;
      }
      result.push({
        time: klines[i].open_time / 1000 as Time,
        value: sum / period,
      });
    } else {
      const prevEMA = result[result.length - 1].value;
      const ema = (klines[i].close - prevEMA) * multiplier + prevEMA;
      result.push({
        time: klines[i].open_time / 1000 as Time,
        value: ema,
      });
    }
  }
  return result;
}

function calculateRSI(klines: Kline[], period: number) {
  const result = [];
  let gains = 0;
  let losses = 0;

  // 计算初始平均涨跌
  for (let i = 1; i <= period; i++) {
    const change = klines[i].close - klines[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < klines.length; i++) {
    const change = klines[i].close - klines[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    result.push({
      time: klines[i].open_time / 1000 as Time,
      value: Math.round(rsi * 100) / 100,
    });
  }
  return result;
}

function calculateMACD(klines: Kline[]) {
  const dif: { time: Time; value: number }[] = [];
  const dea: { time: Time; value: number }[] = [];
  const histogram: { time: Time; value: number; color?: string }[] = [];

  const ema12 = calculateEMAInternal(klines, 12);
  const ema26 = calculateEMAInternal(klines, 26);

  // DIF = EMA12 - EMA26
  for (let i = 0; i < ema26.length; i++) {
    const idx12 = ema12.findIndex(e => e.time === ema26[i].time);
    if (idx12 >= 0) {
      dif.push({
        time: ema26[i].time,
        value: ema12[idx12].value - ema26[i].value,
      });
    }
  }

  // DEA = EMA(DIF, 9)
  const difValues = dif.map(d => ({ close: d.value, open_time: d.time as number * 1000 }));
  const deaEMA = calculateEMAInternal(difValues.map(d => ({
    close: d.close,
    open_time: d.open_time
  })), 9);

  for (const d of deaEMA) {
    dea.push({ time: d.time, value: d.value });
  }

  // Histogram = DIF - DEA
  for (let i = 0; i < dif.length; i++) {
    const deaIdx = dea.findIndex(d => d.time === dif[i].time);
    if (deaIdx >= 0) {
      const value = dif[i].value - dea[deaIdx].value;
      histogram.push({
        time: dif[i].time,
        value,
        color: value >= 0 ? '#26a69a' : '#ef5350',
      });
    }
  }

  return { dif, dea, histogram };
}

function calculateEMAInternal(data: { close: number; open_time: number }[], period: number) {
  const result = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;

    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      result.push({
        time: data[i].open_time / 1000 as Time,
        value: sum / period,
      });
    } else {
      const prevEMA = result[result.length - 1].value;
      const ema = (data[i].close - prevEMA) * multiplier + prevEMA;
      result.push({
        time: data[i].open_time / 1000 as Time,
        value: ema,
      });
    }
  }
  return result;
}

function calculateBollinger(klines: Kline[], period = 20, multiplier = 2) {
  const upper: { time: Time; value: number }[] = [];
  const middle: { time: Time; value: number }[] = [];
  const lower: { time: Time; value: number }[] = [];

  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += klines[i - j].close;
    }
    const sma = sum / period;

    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(klines[i - j].close - sma, 2);
    }
    const stdDev = Math.sqrt(variance / period);

    upper.push({ time: klines[i].open_time / 1000 as Time, value: sma + multiplier * stdDev });
    middle.push({ time: klines[i].open_time / 1000 as Time, value: sma });
    lower.push({ time: klines[i].open_time / 1000 as Time, value: sma - multiplier * stdDev });
  }

  return { upper, middle, lower };
}

function buildInspectorSnapshot(kline: Kline | null): ChartInspectorSnapshot | null {
  if (!kline) return null;

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
