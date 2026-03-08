import axios from 'axios';
import WebSocket from 'ws';
import type { ExchangeAdapter, Kline, SymbolInfo } from '../types/index.js';

export class BinanceAdapter implements ExchangeAdapter {
  private baseUrl = 'https://api.binance.com';
  private wsUrl = 'wss://stream.binance.com:9443/ws';
  private wsConnections: Map<string, WebSocket> = new Map();

  // 时间周期映射
  private intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };

  // 获取 K 线数据
  async getKlines(symbol: string, interval: string, limit: number = 1000): Promise<Kline[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v3/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval: this.intervalMap[interval] || '1h',
          limit: Math.min(limit, 1000),
        },
      });

      return response.data.map((k: any[]) => ({
        exchange: 'binance',
        symbol: symbol.toUpperCase(),
        interval: this.intervalMap[interval] || '1h',
        open_time: k[0],
        close_time: k[6],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quote_volume: parseFloat(k[7]),
        trades_count: k[8],
        is_closed: 1,
      }));
    } catch (error: any) {
      console.error('Binance getKlines error:', error.message);
      throw new Error(`Binance API error: ${error.message}`);
    }
  }

  // 订阅实时 K 线（WebSocket）
  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@kline_${this.intervalMap[interval] || '1h'}`;
    const wsUrl = `${this.wsUrl}/${streamName}`;

    const ws = new WebSocket(wsUrl);
    const key = `kline:${symbol}:${interval}`;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        const k = data.k;

        const kline: Kline = {
          exchange: 'binance',
          symbol: symbol.toUpperCase(),
          interval: this.intervalMap[interval] || '1h',
          open_time: k.t,
          close_time: k.T,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          quote_volume: parseFloat(k.q),
          trades_count: k.n,
          is_closed: k.x ? 1 : 0,
        };

        callback(kline);
      } catch (error: any) {
        console.error('Binance Kline parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      console.error('Binance WebSocket error:', error);
    };

    this.wsConnections.set(key, ws);

    // 返回取消订阅函数
    return () => {
      ws.close();
      this.wsConnections.delete(key);
    };
  }

  // 订阅最新价格（WebSocket）
  subscribePrice(
    symbol: string,
    callback: (price: number) => void
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@trade`;
    const wsUrl = `${this.wsUrl}/${streamName}`;

    const ws = new WebSocket(wsUrl);
    const key = `price:${symbol}`;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        const price = parseFloat(data.p);
        callback(price);
      } catch (error: any) {
        console.error('Binance Price parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      console.error('Binance WebSocket error:', error);
    };

    this.wsConnections.set(key, ws);

    return () => {
      ws.close();
      this.wsConnections.delete(key);
    };
  }

  // 获取交易对列表
  async getSymbols(): Promise<SymbolInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v3/exchangeInfo`);
      
      return response.data.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .filter((s: any) => ['BTC', 'ETH'].includes(s.baseAsset))
        .map((s: any) => ({
          exchange: 'binance',
          symbol: s.symbol,
          base_asset: s.baseAsset,
          quote_asset: s.quoteAsset,
          type: 'spot',
          status: 'active',
        }));
    } catch (error: any) {
      console.error('Binance getSymbols error:', error.message);
      return [];
    }
  }

  // 关闭所有 WebSocket 连接
  closeAll() {
    this.wsConnections.forEach((ws) => ws.close());
    this.wsConnections.clear();
  }
}
