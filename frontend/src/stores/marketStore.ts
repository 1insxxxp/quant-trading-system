import { create } from 'zustand';
import type { MarketState, Kline } from '../types/index.js';

export const useMarketStore = create<MarketState>((set, get) => ({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  interval: '1h',
  klines: [],
  latestPrice: null,
  isConnected: false,

  setExchange: (exchange: string) => {
    set({ exchange });
    get().fetchKlines();
  },

  setSymbol: (symbol: string) => {
    set({ symbol });
    get().fetchKlines();
  },

  setInterval: (interval: string) => {
    set({ interval });
    get().fetchKlines();
  },

  setKlines: (klines: Kline[]) => {
    set({ klines });
  },

  updateKline: (kline: Kline) => {
    const { klines } = get();
    const index = klines.findIndex((k) => k.open_time === kline.open_time);

    if (index >= 0) {
      // 更新现有 K 线
      const newKlines = [...klines];
      newKlines[index] = kline;
      set({ klines: newKlines });
    } else {
      // 添加新 K 线
      set({ klines: [...klines, kline] });
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
    console.log(`🔄 获取 K 线数据：${exchange} ${symbol} ${interval}`);
    
    try {
      const response = await fetch(
        `/api/klines?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=1000`
      );
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ 获取到 ${data.count} 根 K 线`);
        set({ klines: data.klines });
      } else {
        console.error('获取 K 线失败:', data.error);
        set({ klines: [] });
      }
    } catch (error) {
      console.error('获取 K 线失败:', error);
      set({ klines: [] });
    }
  },
}));
