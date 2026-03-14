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

interface OKXAdapterOptions {
  transportConfig?: ExchangeTransportConfig;
  httpGet?: HttpGet;
  WebSocketCtor?: WebSocketCtor;
  wsReconnectDelayMs?: number;
  wsIdleTimeoutMs?: number;
}

export class OKXAdapter implements ExchangeAdapter {
  private readonly baseUrl = 'https://www.okx.com';
  private readonly wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
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
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
  };

  constructor(options: OKXAdapterOptions = {}) {
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
      const instId = symbol.toUpperCase();
      const response = await runTransportAttempts(
        createTransportAttempts(this.transportConfig.rest, this.transportConfig.proxyUrl),
        async (attempt) => this.httpGet(`${this.baseUrl}/api/v5/market/candles`, {
          params: {
            instId: instId.replace('USDT', '-USDT'),
            bar: this.intervalMap[interval] || '1H',
            limit: Math.min(limit, 300),
            ...(typeof before === 'number' ? { after: String(before) } : {}),
          },
          httpAgent: attempt.agent,
          httpsAgent: attempt.agent,
          proxy: false,
          timeout: this.requestTimeoutMs,
        }),
      );

      return response.data.data.map((item: string[]) => {
        const openTime = Number(item[0]);
        const closeTime = openTime + this.getIntervalMs(interval);

        return {
          exchange: 'okx',
          symbol: symbol.toUpperCase(),
          interval,
          open_time: openTime,
          close_time: closeTime,
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          quote_volume: parseFloat(item[6]),
          trades_count: undefined,
          is_closed: resolveOkxRestKlineClosedState(item, closeTime),
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
    const key = `trades:${symbol}`;
    return this.openWebSocketWithFallback(this.wsUrl, key, 'trade', (ws) => {
      const pingInterval = this.attachPing(ws);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'trades', instId }],
        }));
      });

      ws.on('message', (payload) => {
        try {
          const data = JSON.parse(payload.toString());
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
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
      });
    });
  }

  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void,
  ): () => void {
    const instId = symbol.toUpperCase().replace('USDT', '-USDT');
    const channel = `candle${this.intervalMap[interval] || '1H'}`;
    const key = `kline:${symbol}:${interval}`;
    return this.openWebSocketWithFallback(this.wsUrl, key, 'kline', (ws) => {
      const pingInterval = this.attachPing(ws);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel, instId }],
        }));
      });

      ws.on('message', (payload) => {
        try {
          const data = JSON.parse(payload.toString());
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
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
      });
    });
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
      const response = await runTransportAttempts(
        createTransportAttempts(this.transportConfig.rest, this.transportConfig.proxyUrl),
        async (attempt) => this.httpGet(`${this.baseUrl}/api/v5/public/instruments`, {
          params: {
            instType: 'SPOT',
          },
          httpAgent: attempt.agent,
          httpsAgent: attempt.agent,
          proxy: false,
          timeout: this.requestTimeoutMs,
        }),
      );

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

          console.warn(`OKX ${label} WebSocket idle for ${this.wsIdleTimeoutMs}ms, reconnecting...`);
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

        console.error(`OKX ${label} WebSocket error via ${attempt.kind}:`, error);
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

function resolveOkxRestKlineClosedState(item: string[], closeTime: number): number {
  const confirm = item[8];

  if (confirm === '1') {
    return 1;
  }

  if (confirm === '0') {
    return 0;
  }

  return Date.now() > closeTime ? 1 : 0;
}
