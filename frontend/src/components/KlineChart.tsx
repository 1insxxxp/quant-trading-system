import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { useMarketStore } from '../stores/marketStore';

export const KlineChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const previousDataRef = useRef<CandlestickData[]>([]);
  
  const { klines, exchange, symbol, interval } = useMarketStore();

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 创建图表
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { color: '#1e222d' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
    });

    // 创建 K 线系列
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    previousDataRef.current = [];

    // 响应式调整大小
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      previousDataRef.current = [];
      chart.remove();
    };
  }, []);

  // 更新 K 线数据
  useEffect(() => {
    if (!candleSeriesRef.current) {
      console.warn('⚠️ 图表系列未初始化');
      return;
    }

    console.log(`📊 更新图表数据：${exchange} ${symbol} ${interval}, K 线数量：${klines.length}`);

    if (klines.length === 0) {
      console.log('⚠️ 数据为空，清空图表');
      candleSeriesRef.current.setData([]);
      return;
    }

    // 转换数据格式
    const data: CandlestickData[] = klines.map((k) => ({
      time: (k.open_time / 1000) as any,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const previousData = previousDataRef.current;
    const previousLast = previousData[previousData.length - 1];
    const nextLast = data[data.length - 1];

    console.log(`📈 设置图表数据，第一条：${data[0].time}, 最后一条：${nextLast.time}`);

    if (previousData.length === 0) {
      candleSeriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    } else if (
      previousData.length === data.length &&
      previousLast?.time === nextLast.time
    ) {
      candleSeriesRef.current.update(nextLast);
    } else if (previousData.length + 1 === data.length) {
      candleSeriesRef.current.update(nextLast);
      chartRef.current?.timeScale().scrollToRealTime();
    } else {
      candleSeriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }

    previousDataRef.current = data;
    console.log('✅ 图表数据已更新');
  }, [klines, exchange, symbol, interval]); // 所有依赖都加上

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          {exchange.toUpperCase()} - {symbol} - {interval}
        </span>
      </div>
      <div
        ref={chartContainerRef}
        data-testid="kline-chart"
        style={styles.chartContainer}
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e222d',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #2a2e39',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#d1d4dc',
  },
  chartContainer: {
    flex: 1,
    position: 'relative',
  },
};
