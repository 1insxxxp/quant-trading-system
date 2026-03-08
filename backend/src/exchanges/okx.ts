import axios from 'axios';
import WebSocket from 'ws';
import type { ExchangeAdapter, Kline, SymbolInfo } from '../types/index.js';

export class OKXAdapter implements ExchangeAdapter {
  private baseUrl = 'https://www.okx.com';
  private wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
  private wsConnections: Map<string, WebSocket> = new Map();

  // OKX API 使用大写周期格式
  private intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
  };

  // 获取 K 线数据
  async getKlines(symbol: string, interval: string, limit: number = 1000): Promise<Kline[]> {
    try {
      // OKX 现货和合约的 instId 格式不同
      const instId = symbol.toUpperCase(); // BTC-USDT 格式
      const response = await axios.get(`${this.baseUrl}/api/v5/market/candles`, {
        params: {
          instId: instId.replace('USDT', '-USDT'),
          bar: this.intervalMap[interval] || '1H',
          limit: Math.min(limit, 100),
        },
      });

      return response.data.data.map((k: string[]) => {
        const openTime = Number(k[0]);

        return {
          exchange: 'okx',
          symbol: symbol.toUpperCase(),
          interval: interval, // 使用传入的 interval，不要用映射
          open_time: openTime,
          close_time: openTime + this.getIntervalMs(interval),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          quote_volume: parseFloat(k[6]),
          trades_count: undefined,
          is_closed: 1,
        };
      });
    } catch (error: any) {
      console.error('OKX getKlines error:', error.message);
      throw new Error(`OKX API error: ${error.message}`);
    }
  }

  // 订阅实时 K 线（WebSocket）
  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void
  ): () => void {
    const instId = symbol.toUpperCase().replace('USDT', '-USDT');
    const channel = `candle${this.intervalMap[interval] || '1H'}:${instId}`;
    
    const ws = new WebSocket(this.wsUrl);
    const key = `kline:${symbol}:${interval}`;

    ws.onopen = () => {
      // 订阅
      const subscribeMsg = {
        op: 'subscribe',
        args: [
          {
            channel: channel,
            instId: instId,
          },
        ],
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        
        // 忽略 pong 响应
        if (data.event === 'pong') return;
        
        // 处理 K 线数据
        if (data.arg && data.arg.channel && data.arg.channel.startsWith('candle')) {
          const k = data.data[0];
          if (!k) return;
          const openTime = Number(k[0]);

          const kline: Kline = {
            exchange: 'okx',
            symbol: symbol.toUpperCase(),
            interval: interval, // 使用传入的 interval
            open_time: openTime,
            close_time: openTime + this.getIntervalMs(interval),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quote_volume: parseFloat(k[6]),
            trades_count: undefined,
            is_closed: 1,
          };

          callback(kline);
        }
      } catch (error: any) {
        console.error('OKX Kline parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      console.error('OKX WebSocket error:', error);
    };

    // 心跳
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    ws.onclose = () => {
      clearInterval(pingInterval);
    };

    this.wsConnections.set(key, ws);

    return () => {
      clearInterval(pingInterval);
      ws.close();
      this.wsConnections.delete(key);
    };
  }

  // 订阅最新价格（WebSocket）
  subscribePrice(
    symbol: string,
    callback: (price: number) => void
  ): () => void {
    const instId = symbol.toUpperCase().replace('USDT', '-USDT');
    const channel = `trades:${instId}`;
    
    const ws = new WebSocket(this.wsUrl);
    const key = `price:${symbol}`;

    ws.onopen = () => {
      const subscribeMsg = {
        op: 'subscribe',
        args: [
          {
            channel: channel,
            instId: instId,
          },
        ],
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        
        if (data.event === 'pong') return;
        
        if (data.arg && data.arg.channel === 'trades') {
          const trade = data.data[0];
          if (!trade) return;
          
          const price = parseFloat(trade.px);
          callback(price);
        }
      } catch (error: any) {
        console.error('OKX Price parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      console.error('OKX WebSocket error:', error);
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    ws.onclose = () => {
      clearInterval(pingInterval);
    };

    this.wsConnections.set(key, ws);

    return () => {
      clearInterval(pingInterval);
      ws.close();
      this.wsConnections.delete(key);
    };
  }

  // 获取交易对列表
  async getSymbols(): Promise<SymbolInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v5/public/instruments`, {
        params: {
          instType: 'SPOT',
        },
      });

      return response.data.data
        .filter((s: any) => s.quoteCcy === 'USDT' && s.state === 'live')
        .filter((s: any) => ['BTC', 'ETH'].includes(s.baseCcy))
        .map((s: any) => ({
          exchange: 'okx',
          symbol: s.instId.replace('-', ''),
          base_asset: s.baseCcy,
          quote_asset: s.quoteCcy,
          type: 'spot',
          status: 'active',
        }));
    } catch (error: any) {
      console.error('OKX getSymbols error:', error.message);
      return [];
    }
  }

  // 获取时间间隔毫秒数
  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 60 * 1000;
  }

  // 关闭所有 WebSocket 连接
  closeAll() {
    this.wsConnections.forEach((ws) => ws.close());
    this.wsConnections.clear();
  }
}
