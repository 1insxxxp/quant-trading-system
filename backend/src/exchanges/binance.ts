import axios from 'axios';
import WebSocket from 'ws';
import { createProxyAgent } from '../network/proxy.js';
import { isBenignCloseBeforeConnectError, safeCloseWebSocket } from './websocket-close.js';
import type { ExchangeAdapter, Kline, SymbolInfo, TradeTick } from '../types/index.js';

export class BinanceAdapter implements ExchangeAdapter {
  private readonly baseUrl = 'https://api.binance.com';
  private readonly wsUrl = 'wss://stream.binance.com:9443/ws';
  private readonly requestTimeoutMs = Number(process.env.EXCHANGE_REQUEST_TIMEOUT_MS ?? 2500);
  private readonly proxyAgent = createProxyAgent();
  private readonly wsConnections: Map<string, WebSocket> = new Map();

  private readonly intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };

  async getKlines(
    symbol: string,
    interval: string,
    limit: number = 1000,
    before?: number,
  ): Promise<Kline[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v3/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval: this.intervalMap[interval] || '1h',
          limit: Math.min(limit, 1000),
          ...(typeof before === 'number' ? { endTime: before - 1 } : {}),
        },
        httpAgent: this.proxyAgent,
        httpsAgent: this.proxyAgent,
        proxy: false,
        timeout: this.requestTimeoutMs,
      });

      return response.data.map((item: any[]) => ({
        exchange: 'binance',
        symbol: symbol.toUpperCase(),
        interval: this.intervalMap[interval] || '1h',
        open_time: item[0],
        close_time: item[6],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        quote_volume: parseFloat(item[7]),
        trades_count: item[8],
        is_closed: 1,
      }));
    } catch (error: any) {
      console.error('Binance getKlines error:', error.message);
      throw new Error(`Binance API error: ${error.message}`);
    }
  }

  subscribeTrades(
    symbol: string,
    callback: (trade: TradeTick) => void,
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@trade`;
    const wsUrl = `${this.wsUrl}/${streamName}`;
    const ws = new WebSocket(wsUrl, {
      agent: this.proxyAgent,
      handshakeTimeout: this.requestTimeoutMs,
    });
    const key = `trades:${symbol}`;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        const price = parseFloat(data.p);
        const quantity = parseFloat(data.q);

        callback({
          exchange: 'binance',
          symbol: symbol.toUpperCase(),
          price,
          quantity,
          quote_volume: price * quantity,
          timestamp: Number(data.T),
        });
      } catch (error: any) {
        console.error('Binance trade parse error:', error.message);
      }
    };

    ws.onclose = () => {
      this.wsConnections.delete(key);
    };

    ws.onerror = (error) => {
      if (isBenignCloseBeforeConnectError(error, ws)) {
        return;
      }

      console.error('Binance trade WebSocket error:', error);
    };

    this.wsConnections.set(key, ws);

    return () => {
      safeCloseWebSocket(ws);
    };
  }

  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void,
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@kline_${this.intervalMap[interval] || '1h'}`;
    const wsUrl = `${this.wsUrl}/${streamName}`;
    const ws = new WebSocket(wsUrl, {
      agent: this.proxyAgent,
      handshakeTimeout: this.requestTimeoutMs,
    });
    const key = `kline:${symbol}:${interval}`;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        const kline = data.k;

        callback({
          exchange: 'binance',
          symbol: symbol.toUpperCase(),
          interval: this.intervalMap[interval] || '1h',
          open_time: kline.t,
          close_time: kline.T,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
          quote_volume: parseFloat(kline.q),
          trades_count: kline.n,
          is_closed: kline.x ? 1 : 0,
        });
      } catch (error: any) {
        console.error('Binance kline parse error:', error.message);
      }
    };

    ws.onclose = () => {
      this.wsConnections.delete(key);
    };

    ws.onerror = (error) => {
      if (isBenignCloseBeforeConnectError(error, ws)) {
        return;
      }

      console.error('Binance kline WebSocket error:', error);
    };

    this.wsConnections.set(key, ws);

    return () => {
      safeCloseWebSocket(ws);
    };
  }

  subscribePrice(
    symbol: string,
    callback: (price: number) => void,
  ): () => void {
    const unsubscribe = this.subscribeTrades(symbol, (trade) => {
      callback(trade.price);
    });

    return unsubscribe;
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v3/exchangeInfo`, {
        httpAgent: this.proxyAgent,
        httpsAgent: this.proxyAgent,
        proxy: false,
        timeout: this.requestTimeoutMs,
      });

      return response.data.symbols
        .filter((item: any) => item.quoteAsset === 'USDT' && item.status === 'TRADING')
        .filter((item: any) => ['BTC', 'ETH'].includes(item.baseAsset))
        .map((item: any) => ({
          exchange: 'binance',
          symbol: item.symbol,
          base_asset: item.baseAsset,
          quote_asset: item.quoteAsset,
          type: 'spot',
          status: 'active',
        }));
    } catch (error: any) {
      console.error('Binance getSymbols error:', error.message);
      return [];
    }
  }

  closeAll() {
    this.wsConnections.forEach((ws) => safeCloseWebSocket(ws));
    this.wsConnections.clear();
  }
}
