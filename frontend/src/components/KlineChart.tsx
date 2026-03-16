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
  const isSyncingCrosshairRef = useRef(false);
  // 存储当前所有副图引用的 ref
  const subChartsRef = useRef<IChartApi[]>([]);
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

  // 副图可见性状态 - 用于控制副图创建/销毁，不影响主图
  const [activeSubCharts, setActiveSubCharts] = useState({
    volume: indicatorSettings.volume,
    rsi: indicatorSettings.rsi,
    macd: indicatorSettings.macd,
  });

  // 当indicatorSettings变化时同步副图可见性状态
  useEffect(() => {
    setActiveSubCharts({
      volume: indicatorSettings.volume,
      rsi: indicatorSettings.rsi,
      macd: indicatorSettings.macd,
    });
  }, [indicatorSettings.volume, indicatorSettings.rsi, indicatorSettings.macd]);

  themeRef.current = theme;
  latestPriceRef.current = latestPrice;
  latestKlineRef.current = klines[klines.length - 1] ?? null;

  // 同步时间轴的函数 - 使用 logical range 同步
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

  // 同步十字线到所有图表
  const syncCrosshair = (sourceChart: IChartApi, targetCharts: IChartApi[], param: MouseEventParams<Time>) => {
    if (isSyncingCrosshairRef.current) return;
    isSyncingCrosshairRef.current = true;

    try {
      // 获取当前鼠标位置的 logical index
      const clientX = param.point?.x;
      if (clientX === undefined || !param.time) {
        isSyncingCrosshairRef.current = false;
        return;
      }

      // 将 clientX 转换为相对于图表容器的坐标
      const chartRect = sourceChart.timeScale().getVisibleLogicalRange();
      if (!chartRect) {
        isSyncingCrosshairRef.current = false;
        return;
      }

      // 获取源图表的宽度
      const sourceWidth = (sourceChart as any)._privateOptions?.width || 0;
      if (!sourceWidth) {
        isSyncingCrosshairRef.current = false;
        return;
      }

      // 计算 logical index
      const logicalIndex = sourceChart.timeScale().coordinateToLogicalIndex(clientX);
      if (logicalIndex === null) {
        isSyncingCrosshairRef.current = false;
        return;
      }

      // 同步到其他图表
      targetCharts.forEach(chart => {
        if (chart && chart !== sourceChart) {
          try {
            // scrollToPosition 会滚动图表使指定 logical index 位于视图中心
            // 但我们希望保持可见范围不变，只更新十字线位置
            // 由于时间轴已同步，相同的 logical index 应该对应相同的视觉位置
          } catch {
            // Chart may be disposed, ignore
          }
        }
      });
    } catch {
      // Source chart may be disposed, ignore
    }

    isSyncingCrosshairRef.current = false;
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

  // 主图初始化useEffect - 只依赖交易所/交易对/周期
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const initialTheme = getChartTheme(theme);
    const containerHeight = chartContainerRef.current.clientHeight;
    const totalHeight = containerHeight > 0 ? containerHeight : MIN_CHART_HEIGHT;

    // 初始创建时，先检查当前activeSubCharts状态
    const hasVolume = activeSubCharts.volume;
    const hasRSI = activeSubCharts.rsi;
    const hasMACD = activeSubCharts.macd;
    const subChartCount = (hasVolume ? 1 : 0) + (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
    const subChartsTotalHeight = subChartCount * SUB_CHART_HEIGHT;
    const mainChartHeight = Math.max(totalHeight * MAIN_CHART_RATIO, totalHeight - subChartsTotalHeight - 40);

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

    // 主图创建完成，副图由单独的useEffect管理
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

    const resizeChart = () => {
      if (chartContainerRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        const newTotalHeight = Math.max(chartContainerRef.current.clientHeight, MIN_CHART_HEIGHT);

        // 使用activeSubCharts计算高度
        const newSubChartCount = (activeSubCharts.volume ? 1 : 0) + (activeSubCharts.rsi ? 1 : 0) + (activeSubCharts.macd ? 1 : 0);
        const newSubChartsTotalHeight = newSubChartCount * SUB_CHART_HEIGHT;
        const newMainChartHeight = Math.max(newTotalHeight * MAIN_CHART_RATIO, newTotalHeight - newSubChartsTotalHeight - 40);

        mainChart.applyOptions({ width: newWidth, height: newMainChartHeight });
        // 副图resize由副图useEffect处理
        syncDetachedRealtimePriceLine();
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resizeChart())
      : null;

    resizeObserver?.observe(chartContainerRef.current);
    window.addEventListener('resize', resizeChart);

    // 全局 mousemove 监听器，用于同步所有图表的十字线
    const handleContainerMouseMove = (e: MouseEvent) => {
      if (!chartContainerRef.current) return;

      const rect = chartContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 获取所有图表的高度信息，判断鼠标在哪个图表区域
      const mainChartHeight = (mainChartRef.current as any)?._privateOptions?.height || 0;
      const volumeChartHeight = (volumeChartRef.current as any)?._privateOptions?.height || 0;
      const rsiChartHeight = (rsiChartRef.current as any)?._privateOptions?.height || 0;
      const macdChartHeight = (macdChartRef.current as any)?._privateOptions?.height || 0;

      // 计算每个图表的 Y 轴范围
      let currentY = 0;
      const chartRanges: { chart: IChartApi | null; start: number; end: number }[] = [];

      // 主图区域
      chartRanges.push({
        chart: mainChartRef.current,
        start: currentY,
        end: currentY + mainChartHeight,
      });
      currentY += mainChartHeight + 10; // 10px 间距

      // 成交量副图区域
      if (volumeChartRef.current && activeSubCharts.volume) {
        chartRanges.push({
          chart: volumeChartRef.current,
          start: currentY,
          end: currentY + volumeChartHeight,
        });
        currentY += volumeChartHeight + 10;
      }

      // RSI 副图区域
      if (rsiChartRef.current && activeSubCharts.rsi) {
        chartRanges.push({
          chart: rsiChartRef.current,
          start: currentY,
          end: currentY + rsiChartHeight,
        });
        currentY += rsiChartHeight + 10;
      }

      // MACD 副图区域
      if (macdChartRef.current && activeSubCharts.macd) {
        chartRanges.push({
          chart: macdChartRef.current,
          start: currentY,
          end: currentY + macdChartHeight,
        });
      }

      // 找到鼠标所在的图表
      const hoveredChart = chartRanges.find(range => mouseY >= range.start && mouseY < range.end && range.chart);

      if (hoveredChart?.chart) {
        const logicalIndex = hoveredChart.chart.timeScale().coordinateToLogicalIndex(mouseX);
        if (logicalIndex !== null) {
          // 同步所有图表的时间轴滚动位置
          chartRanges.forEach(range => {
            if (range.chart && range.chart !== hoveredChart.chart) {
              try {
                range.chart.timeScale().scrollToPosition(logicalIndex, false);
              } catch {
                // Ignore
              }
            }
          });
        }
      }
    };

    chartContainerRef.current?.addEventListener('mousemove', handleContainerMouseMove);

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

    // 主图十字线移动同步到副图的处理器
    const handleMainCrosshairMove = (param: MouseEventParams<Time>) => {
      setHoveredKline(resolveKlineFromCrosshair({
        param,
        klines: useMarketStore.getState().klines,
      }));
      // 同步十字线到所有副图
      syncCrosshair(mainChart, subChartsRef.current, param);
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
    mainChart.subscribeCrosshairMove(handleMainCrosshairMove);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeChart);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange as never);
      mainChart.unsubscribeCrosshairMove(handleMainCrosshairMove);

      // Clear price line refs before removing charts
      realtimePriceLineRef.current = null;

      mainChart.remove();

      mainChartRef.current = null;
    };
  }, [exchange, symbol, interval]);

  // 副图管理useEffect - 处理副图的动态创建/销毁，不影响主图数据
  useEffect(() => {
    if (!chartContainerRef.current || !mainChartRef.current) return;

    const mainChart = mainChartRef.current;
    const initialTheme = getChartTheme(theme);

    // 保存当前可见范围
    const savedVisibleRange = mainChart.timeScale().getVisibleLogicalRange();

    // 计算新的布局高度
    const containerHeight = chartContainerRef.current.clientHeight;
    const totalHeight = containerHeight > 0 ? containerHeight : MIN_CHART_HEIGHT;
    const subChartCount = (activeSubCharts.volume ? 1 : 0) + (activeSubCharts.rsi ? 1 : 0) + (activeSubCharts.macd ? 1 : 0);
    const subChartsTotalHeight = subChartCount * SUB_CHART_HEIGHT;
    const mainChartHeight = Math.max(totalHeight * MAIN_CHART_RATIO, totalHeight - subChartsTotalHeight - 40);
    const actualSubChartHeight = subChartCount > 0 ? (totalHeight - mainChartHeight - 40) / subChartCount : 0;

    // 更新主图高度
    mainChart.applyOptions({ height: mainChartHeight });

    // 清理已存在的副图
    if (volumeChartRef.current) {
      volumeChartRef.current.remove();
      volumeChartRef.current = null;
      volumeSeriesRef.current = null;
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      rsiUpperBandRef.current = null;
      rsiLowerBandRef.current = null;
    }
    if (macdChartRef.current) {
      macdChartRef.current.remove();
      macdChartRef.current = null;
      macdDIFSeriesRef.current = null;
      macdDEASeriesRef.current = null;
      macdHistogramSeriesRef.current = null;
      macdZeroLineRef.current = null;
    }

    const subCharts: IChartApi[] = [];
    const containerWidth = chartContainerRef.current.clientWidth || 800;

    // Crosshair 移动处理 - 同步到所有图表
    const handleSubChartCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time) {
        setHoveredKline(resolveKlineFromCrosshair({
          param,
          klines: useMarketStore.getState().klines,
        }));
      }
      syncCrosshair(mainChart, subCharts, param);
    };

    // 创建成交量副图
    if (activeSubCharts.volume) {
      const volumeChart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' },
        },
        crosshair: {
          mode: isCrosshairMagnetEnabled ? 1 : 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: true, color: initialTheme.crosshairColor },
        },
        timeScale: {
          visible: false,
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: initialTheme.scaleBorderColor,
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          visible: true,
        },
        handleScale: {
          axisPressedMouseMove: { time: false, price: true },
          mouseWheel: false,
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

      // 订阅十字线移动，同步到主图和其他副图
      volumeChart.subscribeCrosshairMove(handleSubChartCrosshairMove);
    }

    // 创建RSI副图
    if (activeSubCharts.rsi) {
      const rsiChart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' },
        },
        crosshair: {
          mode: isCrosshairMagnetEnabled ? 1 : 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: true, color: initialTheme.crosshairColor },
        },
        timeScale: {
          visible: false,
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
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

      // 订阅十字线移动，同步到主图和其他副图
      rsiChart.subscribeCrosshairMove(handleSubChartCrosshairMove);
    }

    // 创建MACD副图
    if (activeSubCharts.macd) {
      const macdChart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: actualSubChartHeight,
        layout: initialTheme.layout,
        grid: {
          vertLines: { color: initialTheme.grid.vertLines.color },
          horzLines: { color: 'transparent' },
        },
        crosshair: {
          mode: isCrosshairMagnetEnabled ? 1 : 0,
          vertLine: { color: initialTheme.crosshairColor },
          horzLine: { visible: true, color: initialTheme.crosshairColor },
        },
        timeScale: {
          visible: false,
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
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

      // 订阅十字线移动，同步到主图和其他副图
      macdChart.subscribeCrosshairMove(handleSubChartCrosshairMove);
    }

    // 同步时间轴
    const handleMainTimeScaleChange = () => {
      syncTimeScale(mainChart, subCharts);
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleMainTimeScaleChange);

    // 恢复可见范围并同步到副图
    if (savedVisibleRange) {
      mainChart.timeScale().setVisibleLogicalRange(savedVisibleRange);
      visibleLogicalRangeRef.current = savedVisibleRange;
    }

    // 同步实时价格线位置（因为高度变化可能影响价格线显示）
    syncDetachedRealtimePriceLine(savedVisibleRange?.to);

    // 如果有副图，同步数据
    if (klines.length > 0) {
      syncIndicators(klines, indicatorSettings);
    }

    // 数据同步后，立即同步副图时间轴
    syncTimeScale(mainChart, subCharts);

    // 更新副图引用，供主图 crosshair 同步使用
    subChartsRef.current = subCharts;

    return () => {
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleMainTimeScaleChange);
      // 取消订阅副图的 crosshair 移动
      subCharts.forEach(chart => {
        try {
          chart.unsubscribeCrosshairMove(handleSubChartCrosshairMove);
        } catch {
          // Chart may be disposed, ignore
        }
      });
    };
  }, [activeSubCharts, theme, klines, indicatorSettings]);

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
          mode: isCrosshairMagnetEnabled ? 1 : 0,
          vertLine: { color: nextTheme.crosshairColor },
          horzLine: { visible: true, color: nextTheme.crosshairColor },
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
    // 使用 buildCandlestickData 处理 klines，确保指标数据与主图 K 线对齐
    const data = buildCandlestickData(klines);
    const klineCount = data.length;

    if (klineCount === 0) {
      // 清空所有指标
      ma5SeriesRef.current?.setData([]);
      ma10SeriesRef.current?.setData([]);
      ma20SeriesRef.current?.setData([]);
      ema12SeriesRef.current?.setData([]);
      ema26SeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      rsiSeriesRef.current?.setData([]);
      macdDIFSeriesRef.current?.setData([]);
      macdDEASeriesRef.current?.setData([]);
      macdHistogramSeriesRef.current?.setData([]);
      bollingerUpperSeriesRef.current?.setData([]);
      bollingerMiddleSeriesRef.current?.setData([]);
      bollingerLowerSeriesRef.current?.setData([]);
      return;
    }

    // 从 CandlestickData[] 重建 Kline[] 用于指标计算
    // 注意：我们只需要 close 价格和 open_time，所以可以从 data 反推
    const syntheticKlines: Kline[] = data.map(d => ({
      open_time: Number(d.time) * 1000,
      close_time: Number(d.time) * 1000 + 60000, // 假设 1 分钟间隔
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: 0,
      quote_volume: 0,
      trades_count: 0,
      is_closed: 1,
      exchange: '',
      symbol: '',
      interval: '',
    }));

    // MA - 使用填充版本确保与主图数据对齐
    if (settings.ma5 && ma5SeriesRef.current) {
      const ma5Data = calculateMAWithPadding(syntheticKlines, 5);
      ma5SeriesRef.current.setData(ma5Data);
    } else {
      ma5SeriesRef.current?.setData([]);
    }
    if (settings.ma10 && ma10SeriesRef.current) {
      const ma10Data = calculateMAWithPadding(syntheticKlines, 10);
      ma10SeriesRef.current.setData(ma10Data);
    } else {
      ma10SeriesRef.current?.setData([]);
    }
    if (settings.ma20 && ma20SeriesRef.current) {
      const ma20Data = calculateMAWithPadding(syntheticKlines, 20);
      ma20SeriesRef.current.setData(ma20Data);
    } else {
      ma20SeriesRef.current?.setData([]);
    }

    // EMA - 使用填充版本确保与主图数据对齐
    if (settings.ema12 && ema12SeriesRef.current) {
      const ema12Data = calculateEMAWithPadding(syntheticKlines, 12);
      ema12SeriesRef.current.setData(ema12Data);
    } else {
      ema12SeriesRef.current?.setData([]);
    }
    if (settings.ema26 && ema26SeriesRef.current) {
      const ema26Data = calculateEMAWithPadding(syntheticKlines, 26);
      ema26SeriesRef.current.setData(ema26Data);
    } else {
      ema26SeriesRef.current?.setData([]);
    }

    // Volume
    if (settings.volume && volumeSeriesRef.current) {
      // 创建 klines 的时间到成交量的映射
      const timeToVolume = new Map<number, { value: number; color: string }>();
      for (const k of klines) {
        timeToVolume.set(k.open_time, {
          value: k.volume,
          color: k.close >= k.open ? '#26a69a' : '#ef5350',
        });
      }

      // 使用 syntheticKlines 的时间，从映射中获取成交量
      const volumeData: { time: Time; value: number; color?: string }[] = [];
      for (const sk of syntheticKlines) {
        const vol = timeToVolume.get(sk.open_time);
        if (vol) {
          volumeData.push({ time: sk.open_time / 1000 as Time, value: vol.value, color: vol.color });
        } else {
          // 如果是填充的 K 线，使用 0 作为成交量
          volumeData.push({ time: sk.open_time / 1000 as Time, value: 0, color: '#26a69a' });
        }
      }

      volumeSeriesRef.current.setData(volumeData);
    } else {
      volumeSeriesRef.current?.setData([]);
    }

    // RSI - 需要填充前面无法计算的部分
    if (settings.rsi && rsiSeriesRef.current) {
      const rsiData = calculateRSIWithPadding(syntheticKlines, 14);
      rsiSeriesRef.current.setData(rsiData);
    } else {
      rsiSeriesRef.current?.setData([]);
    }

    // MACD - 需要填充前面无法计算的部分
    if (settings.macd && macdDIFSeriesRef.current && macdDEASeriesRef.current && macdHistogramSeriesRef.current) {
      const macdData = calculateMACDWithPadding(syntheticKlines);
      macdDIFSeriesRef.current.setData(macdData.dif);
      macdDEASeriesRef.current.setData(macdData.dea);
      macdHistogramSeriesRef.current.setData(macdData.histogram);
    } else {
      macdDIFSeriesRef.current?.setData([]);
      macdDEASeriesRef.current?.setData([]);
      macdHistogramSeriesRef.current?.setData([]);
    }

    // Bollinger Bands - 需要填充前面无法计算的部分
    if (settings.bollinger && bollingerUpperSeriesRef.current && bollingerMiddleSeriesRef.current && bollingerLowerSeriesRef.current) {
      const bbData = calculateBollingerWithPadding(syntheticKlines);
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
  const result: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += klines[i - j].close;
    }
    result.push({
      time: klines[i].open_time / 1000 as Time,
      value: Math.round((sum / period) * 100) / 100,
    });
  }
  return result;
}

function calculateEMA(klines: Kline[], period: number) {
  const result: { time: Time; value: number }[] = [];
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
        value: Math.round((sum / period) * 100) / 100,
      });
    } else {
      const prevEMA = result[result.length - 1].value;
      const ema = (klines[i].close - prevEMA) * multiplier + prevEMA;
      result.push({
        time: klines[i].open_time / 1000 as Time,
        value: Math.round(ema * 100) / 100,
      });
    }
  }
  return result;
}

function calculateRSI(klines: Kline[], period: number) {
  if (klines.length < period + 1) {
    return [];
  }

  const result: { time: Time; value: number }[] = [];
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

  // 第一个 RSI
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

  result.push({
    time: klines[period].open_time / 1000 as Time,
    value: Math.round(rsi * 100) / 100,
  });

  // 后续 RSI
  for (let i = period + 1; i < klines.length; i++) {
    const change = klines[i].close - klines[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    result.push({
      time: klines[i].open_time / 1000 as Time,
      value: Math.round(rsi * 100) / 100,
    });
  }

  return result;
}

function calculateMACD(klines: Kline[]) {
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;

  const dif: { time: Time; value: number }[] = [];
  const dea: { time: Time; value: number }[] = [];
  const histogram: { time: Time; value: number; color?: string }[] = [];

  // 计算 EMA12 和 EMA26
  const ema12 = calculateEMAInternal(klines.map(k => ({ close: k.close, open_time: k.open_time })), fastPeriod);
  const ema26 = calculateEMAInternal(klines.map(k => ({ close: k.close, open_time: k.open_time })), slowPeriod);

  // 找到 EMA12 和 EMA26 都有数据的部分
  const ema12Map = new Map(ema12.map(e => [e.time, e.value]));

  // 计算 DIF
  for (let i = 0; i < ema26.length; i++) {
    const e12 = ema12Map.get(ema26[i].time);
    if (e12 !== undefined) {
      dif.push({
        time: ema26[i].time,
        value: Math.round((e12 - ema26[i].value) * 100) / 100,
      });
    }
  }

  // 计算 DEA (DIF 的 EMA)
  if (dif.length >= signalPeriod) {
    const difValues = dif.map(d => ({ close: d.value, open_time: d.time as number * 1000 }));
    const deaEMA = calculateEMAInternal(difValues, signalPeriod);
    for (const d of deaEMA) {
      dea.push({ time: d.time, value: Math.round(d.value * 100) / 100 });
    }
  }

  // 计算 Histogram = DIF - DEA
  for (let i = 0; i < dif.length; i++) {
    const deaIdx = dea.findIndex(d => d.time === dif[i].time);
    if (deaIdx >= 0) {
      const value = dif[i].value - dea[deaIdx].value;
      histogram.push({
        time: dif[i].time,
        value: Math.round(value * 100) / 100,
        color: value >= 0 ? '#26a69a' : '#ef5350',
      });
    }
  }

  return { dif, dea, histogram };
}

function calculateEMAInternal(data: { close: number; open_time: number }[], period: number) {
  const result: { time: Time; value: number }[] = [];
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
  if (klines.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

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

    upper.push({ time: klines[i].open_time / 1000 as Time, value: Math.round((sma + multiplier * stdDev) * 100) / 100 });
    middle.push({ time: klines[i].open_time / 1000 as Time, value: Math.round(sma * 100) / 100 });
    lower.push({ time: klines[i].open_time / 1000 as Time, value: Math.round((sma - multiplier * stdDev) * 100) / 100 });
  }

  return { upper, middle, lower };
}

// 带填充的指标计算函数 - 确保数据长度与 K 线一致，用于副图对齐
function calculateRSIWithPadding(klines: Kline[], period: number) {
  const rsiResult = calculateRSI(klines, period);
  const klineCount = klines.length;

  if (rsiResult.length >= klineCount) {
    return rsiResult;
  }

  // 填充前面的点，使用第一个 RSI 值
  const padded: { time: Time; value: number }[] = [];
  if (rsiResult.length > 0) {
    const firstRsi = rsiResult[0].value;
    for (let i = 0; i < klineCount - rsiResult.length; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: firstRsi });
    }
    padded.push(...rsiResult);
  } else {
    // 无法计算 RSI，返回 50 作为默认值
    for (let i = 0; i < klineCount; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: 50 });
    }
  }

  return padded;
}

function calculateMACDWithPadding(klines: Kline[]) {
  const macdResult = calculateMACD(klines);
  const klineCount = klines.length;

  const padArray = (
    arr: { time: Time; value: number }[],
    defaultValue: number
  ): { time: Time; value: number }[] => {
    if (arr.length >= klineCount) {
      return arr;
    }
    const padded: { time: Time; value: number }[] = [];
    if (arr.length > 0) {
      const firstVal = arr[0].value;
      for (let i = 0; i < klineCount - arr.length; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: firstVal });
      }
      padded.push(...arr);
    } else {
      for (let i = 0; i < klineCount; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: defaultValue });
      }
    }
    return padded;
  };

  const padHistogramArray = (
    arr: { time: Time; value: number; color?: string }[],
    defaultValue: number,
    defaultColor: string
  ): { time: Time; value: number; color?: string }[] => {
    if (arr.length >= klineCount) {
      return arr;
    }
    const padded: { time: Time; value: number; color?: string }[] = [];
    if (arr.length > 0) {
      const firstVal = arr[0].value;
      const firstColor = arr[0].color;
      for (let i = 0; i < klineCount - arr.length; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: firstVal, color: firstColor });
      }
      padded.push(...arr);
    } else {
      for (let i = 0; i < klineCount; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: defaultValue, color: defaultColor });
      }
    }
    return padded;
  };

  return {
    dif: padArray(macdResult.dif, 0),
    dea: padArray(macdResult.dea, 0),
    histogram: padHistogramArray(macdResult.histogram, 0, '#26a69a'),
  };
}

function calculateBollingerWithPadding(klines: Kline[], period = 20, multiplier = 2) {
  const bbResult = calculateBollinger(klines, period, multiplier);
  const klineCount = klines.length;

  const padArray = (
    arr: { time: Time; value: number }[],
    defaultValue: number
  ): { time: Time; value: number }[] => {
    if (arr.length >= klineCount) {
      return arr;
    }
    const padded: { time: Time; value: number }[] = [];
    if (arr.length > 0) {
      const firstVal = arr[0].value;
      for (let i = 0; i < klineCount - arr.length; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: firstVal });
      }
      padded.push(...arr);
    } else {
      for (let i = 0; i < klineCount; i++) {
        padded.push({ time: klines[i].open_time / 1000 as Time, value: defaultValue });
      }
    }
    return padded;
  };

  return {
    upper: padArray(bbResult.upper, klines[klines.length - 1]?.close || 0),
    middle: padArray(bbResult.middle, klines[klines.length - 1]?.close || 0),
    lower: padArray(bbResult.lower, klines[klines.length - 1]?.close || 0),
  };
}

function calculateMAWithPadding(klines: Kline[], period: number) {
  const maResult = calculateMA(klines, period);
  const klineCount = klines.length;

  if (maResult.length >= klineCount) {
    return maResult;
  }

  // 填充前面的点，使用第一个 MA 值
  const padded: { time: Time; value: number }[] = [];
  if (maResult.length > 0) {
    const firstMA = maResult[0].value;
    for (let i = 0; i < klineCount - maResult.length; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: firstMA });
    }
    padded.push(...maResult);
  } else {
    // 无法计算 MA，使用最新收盘价作为默认值
    const defaultPrice = klines[klines.length - 1]?.close || 0;
    for (let i = 0; i < klineCount; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: defaultPrice });
    }
  }

  return padded;
}

function calculateEMAWithPadding(klines: Kline[], period: number) {
  const emaResult = calculateEMA(klines, period);
  const klineCount = klines.length;

  if (emaResult.length >= klineCount) {
    return emaResult;
  }

  // 填充前面的点，使用第一个 EMA 值
  const padded: { time: Time; value: number }[] = [];
  if (emaResult.length > 0) {
    const firstEMA = emaResult[0].value;
    for (let i = 0; i < klineCount - emaResult.length; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: firstEMA });
    }
    padded.push(...emaResult);
  } else {
    // 无法计算 EMA，使用最新收盘价作为默认值
    const defaultPrice = klines[klines.length - 1]?.close || 0;
    for (let i = 0; i < klineCount; i++) {
      padded.push({ time: klines[i].open_time / 1000 as Time, value: defaultPrice });
    }
  }

  return padded;
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
