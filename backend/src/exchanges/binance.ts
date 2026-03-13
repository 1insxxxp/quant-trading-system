import axios from 'axios';
import WebSocket from 'ws';
import {
  createExchangeTransportConfig,
  createTransportAttempts,
  type ExchangeTransportConfig,
  runTransportAttempts,
} from '../network/exchange-transport.js';
import { isBenignCloseBeforeConnectError, safeCloseWebSocket } from './websocket-close.js';
import type { ExchangeAdapter, Kline, SymbolInfo, TradeTick } from '../types/index.js';

type HttpGet = typeof axios.get;
type WebSocketCtor = typeof WebSocket;

interface BinanceAdapterOptions {
  transportConfig?: ExchangeTransportConfig;
  httpGet?: HttpGet;
  WebSocketCtor?: WebSocketCtor;
  wsReconnectDelayMs?: number;
  wsIdleTimeoutMs?: number;
}

export class BinanceAdapter implements ExchangeAdapter {
  private readonly baseUrl = 'https://api.binance.com';
  private readonly wsUrl = 'wss://stream.binance.com:9443/ws';
  private readonly requestTimeoutMs = Number(process.env.EXCHANGE_REQUEST_TIMEOUT_MS ?? 2500);
  private readonly wsHandshakeTimeoutMs = Number(process.env.EXCHANGE_WS_HANDSHAKE_TIMEOUT_MS ?? 10000);
  private readonly wsReconnectDelayMs: number;
  private readonly wsIdleTimeoutMs: number;
  private readonly transportConfig: ExchangeTransportConfig;
  private readonly httpGet: HttpGet;
  private readonly WebSocketCtor: WebSocketCtor;
  private readonly wsConnections: Map<string, WebSocket> = new Map();

  private readonly intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };

  constructor(options: BinanceAdapterOptions = {}) {
    this.transportConfig = options.transportConfig ?? createExchangeTransportConfig();
    this.httpGet = options.httpGet ?? axios.get;
    this.WebSocketCtor = options.WebSocketCtor ?? WebSocket;
    this.wsReconnectDelayMs = options.wsReconnectDelayMs ?? Number(process.env.EXCHANGE_WS_RECONNECT_DELAY_MS ?? 3000);
    this.wsIdleTimeoutMs = options.wsIdleTimeoutMs ?? Number(process.env.EXCHANGE_WS_IDLE_TIMEOUT_MS ?? 45000);
  }

  async getKlines(
    symbol: string,
    interval: string,
    limit: number = 1000,
    before?: number,
  ): Promise<Kline[]> {
    try {
      const response = await runTransportAttempts(
        createTransportAttempts(this.transportConfig.rest, this.transportConfig.proxyUrl),
        async (attempt) => this.httpGet(`${this.baseUrl}/api/v3/klines`, {
          params: {
            symbol: symbol.toUpperCase(),
            interval: this.intervalMap[interval] || '1h',
            limit: Math.min(limit, 1000),
            ...(typeof before === 'number' ? { endTime: before - 1 } : {}),
          },
          httpAgent: attempt.agent,
          httpsAgent: attempt.agent,
          proxy: false,
          timeout: this.requestTimeoutMs,
        }),
      );

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
    const key = `trades:${symbol}`;

    return this.openWebSocketWithFallback(wsUrl, key, 'trade', (ws) => {
      ws.on('message', (payload) => {
        try {
          const data = JSON.parse(payload.toString());
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
      });
    });
  }

  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void,
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@kline_${this.intervalMap[interval] || '1h'}`;
    const wsUrl = `${this.wsUrl}/${streamName}`;
    const key = `kline:${symbol}:${interval}`;

    return this.openWebSocketWithFallback(wsUrl, key, 'kline', (ws) => {
      ws.on('message', (payload) => {
        try {
          const data = JSON.parse(payload.toString());
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
      });
    });
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
      const response = await runTransportAttempts(
        createTransportAttempts(this.transportConfig.rest, this.transportConfig.proxyUrl),
        async (attempt) => this.httpGet(`${this.baseUrl}/api/v3/exchangeInfo`, {
          httpAgent: attempt.agent,
          httpsAgent: attempt.agent,
          proxy: false,
          timeout: this.requestTimeoutMs,
        }),
      );

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

  debugTransport() {
    return this.transportConfig;
  }

  private openWebSocketWithFallback(
    url: string,
    key: string,
    label: string,
    configure: (ws: WebSocket) => void,
  ): () => void {
    const attempts = createTransportAttempts(this.transportConfig.ws, this.transportConfig.proxyUrl);
    let activeSocket: WebSocket | null = null;
    let closedByUser = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connectAttempt = (attemptIndex: number) => {
      const attempt = attempts[attemptIndex];

      if (!attempt || closedByUser) {
        return;
      }

      let opened = false;
      let retryScheduled = false;
      let watchdogTimer: ReturnType<typeof setInterval> | null = null;
      let lastActivityAt = Date.now();
      const ws = new this.WebSocketCtor(url, {
        agent: attempt.agent,
        handshakeTimeout: this.wsHandshakeTimeoutMs,
      }) as WebSocket;

      activeSocket = ws;
      this.wsConnections.set(key, ws);
      configure(ws);

      const clearWatchdog = () => {
        if (watchdogTimer !== null) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
      };

      const markActivity = () => {
        lastActivityAt = Date.now();
      };

      const scheduleRetry = () => {
        if (retryScheduled || closedByUser) {
          return false;
        }

        const nextAttemptIndex = opened ? 0 : attemptIndex + 1;
        if (nextAttemptIndex >= attempts.length) {
          return false;
        }

        retryScheduled = true;
        clearWatchdog();
        this.wsConnections.delete(key);
        const delay = opened
          ? this.wsReconnectDelayMs
          : Math.min(1000 * Math.pow(2, attemptIndex), 30000);
        clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectAttempt(nextAttemptIndex);
        }, delay);
        return true;
      };

      ws.once('open', () => {
        opened = true;
        markActivity();
        clearReconnectTimer();
        watchdogTimer = setInterval(() => {
          if (closedByUser || activeSocket !== ws || ws.readyState !== WebSocket.OPEN) {
            return;
          }

          if (Date.now() - lastActivityAt < this.wsIdleTimeoutMs) {
            return;
          }

          console.warn(`Binance ${label} WebSocket idle for ${this.wsIdleTimeoutMs}ms, reconnecting...`);
          safeCloseWebSocket(ws);
        }, Math.max(1000, Math.floor(this.wsIdleTimeoutMs / 3)));
      });

      ws.on('message', () => {
        markActivity();
      });

      ws.on('error', (error) => {
        if (scheduleRetry()) {
          safeCloseWebSocket(ws);
          return;
        }

        if (isBenignCloseBeforeConnectError(error, ws)) {
          return;
        }

        console.error(`Binance ${label} WebSocket error via ${attempt.kind}:`, error);
      });

      ws.on('close', () => {
        clearWatchdog();
        if (activeSocket === ws) {
          this.wsConnections.delete(key);
          activeSocket = null;
        }

        if (scheduleRetry()) {
          return;
        }
      });
    };

    connectAttempt(0);

    return () => {
      closedByUser = true;
      clearReconnectTimer();

      if (activeSocket) {
        safeCloseWebSocket(activeSocket);
      }
    };
  }
}
