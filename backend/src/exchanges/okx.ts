import axios from 'axios';
import WebSocket from 'ws';
import { createProxyAgent } from '../network/proxy.js';
import { isBenignCloseBeforeConnectError, safeCloseWebSocket } from './websocket-close.js';
import type { ExchangeAdapter, Kline, SymbolInfo, TradeTick } from '../types/index.js';

export class OKXAdapter implements ExchangeAdapter {
  private readonly baseUrl = 'https://www.okx.com';
  private readonly wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
  private readonly requestTimeoutMs = Number(process.env.EXCHANGE_REQUEST_TIMEOUT_MS ?? 2500);
  private readonly proxyAgent = createProxyAgent();
  private readonly wsConnections: Map<string, WebSocket> = new Map();

  private readonly intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
  };

  async getKlines(
    symbol: string,
    interval: string,
    limit: number = 1000,
    before?: number,
  ): Promise<Kline[]> {
    try {
      const instId = symbol.toUpperCase();
      const response = await axios.get(`${this.baseUrl}/api/v5/market/candles`, {
        params: {
          instId: instId.replace('USDT', '-USDT'),
          bar: this.intervalMap[interval] || '1H',
          limit: Math.min(limit, 100),
          ...(typeof before === 'number' ? { after: String(before) } : {}),
        },
        httpAgent: this.proxyAgent,
        httpsAgent: this.proxyAgent,
        proxy: false,
        timeout: this.requestTimeoutMs,
      });

      return response.data.data.map((item: string[]) => {
        const openTime = Number(item[0]);

        return {
          exchange: 'okx',
          symbol: symbol.toUpperCase(),
          interval,
          open_time: openTime,
          close_time: openTime + this.getIntervalMs(interval),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          quote_volume: parseFloat(item[6]),
          trades_count: undefined,
          is_closed: 1,
        };
      });
    } catch (error: any) {
      console.error('OKX getKlines error:', error.message);
      throw new Error(`OKX API error: ${error.message}`);
    }
  }

  subscribeTrades(
    symbol: string,
    callback: (trade: TradeTick) => void,
  ): () => void {
    const instId = symbol.toUpperCase().replace('USDT', '-USDT');
    const ws = new WebSocket(this.wsUrl, {
      agent: this.proxyAgent,
      handshakeTimeout: this.requestTimeoutMs,
    });
    const key = `trades:${symbol}`;
    const pingInterval = this.attachPing(ws);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'trades', instId }],
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.event === 'pong' || !(data.arg?.channel === 'trades')) {
          return;
        }

        const trade = data.data?.[0];
        if (!trade) {
          return;
        }

        const price = parseFloat(trade.px);
        const quantity = parseFloat(trade.sz);

        callback({
          exchange: 'okx',
          symbol: symbol.toUpperCase(),
          price,
          quantity,
          quote_volume: price * quantity,
          timestamp: Number(trade.ts),
        });
      } catch (error: any) {
        console.error('OKX trade parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      if (isBenignCloseBeforeConnectError(error, ws)) {
        return;
      }

      console.error('OKX trade WebSocket error:', error);
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      this.wsConnections.delete(key);
    };

    this.wsConnections.set(key, ws);

    return () => {
      clearInterval(pingInterval);
      safeCloseWebSocket(ws);
    };
  }

  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void,
  ): () => void {
    const instId = symbol.toUpperCase().replace('USDT', '-USDT');
    const channel = `candle${this.intervalMap[interval] || '1H'}`;
    const ws = new WebSocket(this.wsUrl, {
      agent: this.proxyAgent,
      handshakeTimeout: this.requestTimeoutMs,
    });
    const key = `kline:${symbol}:${interval}`;
    const pingInterval = this.attachPing(ws);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel, instId }],
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.event === 'pong' || !data.arg?.channel?.startsWith('candle')) {
          return;
        }

        const item = data.data?.[0];
        if (!item) {
          return;
        }

        const openTime = Number(item[0]);

        callback({
          exchange: 'okx',
          symbol: symbol.toUpperCase(),
          interval,
          open_time: openTime,
          close_time: openTime + this.getIntervalMs(interval),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          quote_volume: parseFloat(item[6]),
          trades_count: undefined,
          is_closed: 1,
        });
      } catch (error: any) {
        console.error('OKX kline parse error:', error.message);
      }
    };

    ws.onerror = (error) => {
      if (isBenignCloseBeforeConnectError(error, ws)) {
        return;
      }

      console.error('OKX kline WebSocket error:', error);
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      this.wsConnections.delete(key);
    };

    this.wsConnections.set(key, ws);

    return () => {
      clearInterval(pingInterval);
      safeCloseWebSocket(ws);
    };
  }

  subscribePrice(
    symbol: string,
    callback: (price: number) => void,
  ): () => void {
    return this.subscribeTrades(symbol, (trade) => {
      callback(trade.price);
    });
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v5/public/instruments`, {
        params: {
          instType: 'SPOT',
        },
        httpAgent: this.proxyAgent,
        httpsAgent: this.proxyAgent,
        proxy: false,
        timeout: this.requestTimeoutMs,
      });

      return response.data.data
        .filter((item: any) => item.quoteCcy === 'USDT' && item.state === 'live')
        .filter((item: any) => ['BTC', 'ETH'].includes(item.baseCcy))
        .map((item: any) => ({
          exchange: 'okx',
          symbol: item.instId.replace('-', ''),
          base_asset: item.baseCcy,
          quote_asset: item.quoteCcy,
          type: 'spot',
          status: 'active',
        }));
    } catch (error: any) {
      console.error('OKX getSymbols error:', error.message);
      return [];
    }
  }

  closeAll() {
    this.wsConnections.forEach((ws) => safeCloseWebSocket(ws));
    this.wsConnections.clear();
  }

  private attachPing(ws: WebSocket): ReturnType<typeof setInterval> {
    return setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);
  }

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
}
