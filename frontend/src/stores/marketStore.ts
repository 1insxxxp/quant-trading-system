import { create } from 'zustand';
import type { MarketState, Kline } from '../types/index.js';

let latestFetchToken = 0;

export function getMarketKey(exchange: string, symbol: string, interval: string): string {
  return `${exchange}:${symbol}:${interval}`;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  interval: '1h',
  klines: [],
  latestPrice: null,
  isConnected: false,

  setExchange: (exchange: string) => {
    set({ exchange, klines: [], latestPrice: null });
    void get().fetchKlines();
  },

  setSymbol: (symbol: string) => {
    set({ symbol, klines: [], latestPrice: null });
    void get().fetchKlines();
  },

  setInterval: (interval: string) => {
    set({ interval, klines: [], latestPrice: null });
    void get().fetchKlines();
  },

  setKlines: (klines: Kline[]) => {
    set({ klines });
  },

  updateKline: (kline: Kline) => {
    const { klines, exchange, symbol, interval } = get();

    if (
      kline.exchange !== exchange ||
      kline.symbol !== symbol ||
      kline.interval !== interval
    ) {
      return;
    }

    const index = klines.findIndex((k) => k.open_time === kline.open_time);

    if (index >= 0) {
      // 更新现有 K 线
      const newKlines = [...klines];
      newKlines[index] = kline;
      newKlines.sort((a, b) => a.open_time - b.open_time);
      set({ klines: newKlines });
    } else {
      // 添加新 K 线
      set({
        klines: [...klines, kline].sort((a, b) => a.open_time - b.open_time),
      });
    }
  },

  setLatestPrice: (price: number) => {
    set({ latestPrice: price });
  },

  setIsConnected: (isConnected: boolean) => {
    set({ isConnected });
  },

  fetchKlines: async () => {
    const { exchange, symbol, interval } = get();
    const marketKey = getMarketKey(exchange, symbol, interval);
    const fetchToken = ++latestFetchToken;
    console.log(`🔄 获取 K 线数据：${exchange} ${symbol} ${interval}`);
    
    try {
      const response = await fetch(
        `/quant/api/klines?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=1000`
      );
      const data = await response.json();

      if (fetchToken !== latestFetchToken) {
        return;
      }

      const currentState = get();
      const currentMarketKey = getMarketKey(
        currentState.exchange,
        currentState.symbol,
        currentState.interval,
      );

      if (currentMarketKey !== marketKey) {
        return;
      }
      
      if (data.success) {
        console.log(`✅ 获取到 ${data.count} 根 K 线`);
        set({ klines: data.klines });
      } else {
        console.error('获取 K 线失败:', data.error);
        set({ klines: [] });
      }
    } catch (error) {
      if (fetchToken !== latestFetchToken) {
        return;
      }
      console.error('获取 K 线失败:', error);
      set({ klines: [] });
    }
  },
}));
