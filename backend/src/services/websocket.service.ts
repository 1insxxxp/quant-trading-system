import WebSocket, { WebSocketServer } from 'ws';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { ExchangeAdapter, Kline, PriceUpdate, WsMessage } from '../types/index.js';
import { klineService } from './kline.service.js';
import { MarketTradeStream } from './market-trade-stream.js';
import { syncStateService } from './sync-state.service.js';

interface MarketStreamEntry {
  exchange: string;
  symbol: string;
  stream: MarketTradeStream;
}

export class WebSocketService {
  private readonly wss: WebSocketServer;
  private readonly clients: Set<WebSocket> = new Set();
  private readonly subscriptions: Map<string, Set<WebSocket>> = new Map();
  private readonly exchangeAdapters: Map<string, ExchangeAdapter> = new Map();
  private readonly marketStreams: Map<string, MarketStreamEntry> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.initExchanges();
    this.setupServer();
    console.log(`WebSocket server listening on ws://localhost:${port}`);
  }

  private initExchanges() {
    this.exchangeAdapters.set('binance', new BinanceAdapter());
    this.exchangeAdapters.set('okx', new OKXAdapter());
  }

  private setupServer() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('message', (data) => {
        try {
          const message: WsMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error: any) {
          this.sendError(ws, `Failed to parse message: ${error.message}`);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.cleanupSubscriptions(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
      });

      this.sendMessage(ws, {
        type: 'connected',
        data: { message: 'Connected to market WebSocket service' },
      });
    });
  }

  private handleMessage(ws: WebSocket, message: WsMessage) {
    switch (message.type) {
      case 'subscribe':
        void this.handleSubscribe(ws, message);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, message);
        break;
      default:
        this.sendError(ws, `Unsupported message type: ${message.type}`);
    }
  }

  private async handleSubscribe(ws: WebSocket, message: WsMessage) {
    const { exchange, symbol, interval } = message;

    if (!exchange || !symbol || !interval) {
      this.sendError(ws, 'Missing subscribe params: exchange, symbol, interval');
      return;
    }

    const subscriptionKey = this.getSubscriptionKey(exchange, symbol, interval);

    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }

    this.subscriptions.get(subscriptionKey)!.add(ws);

    try {
      await this.ensureMarketStream(exchange, symbol, interval);

      this.sendMessage(ws, {
        type: 'subscribed',
        exchange,
        symbol,
        interval,
      });
    } catch (error: any) {
      const clients = this.subscriptions.get(subscriptionKey);

      clients?.delete(ws);
      if (clients && clients.size === 0) {
        this.subscriptions.delete(subscriptionKey);
      }

      this.sendError(ws, `Failed to subscribe ${subscriptionKey}: ${error?.message ?? String(error)}`);
    }
  }

  private handleUnsubscribe(ws: WebSocket, message: WsMessage) {
    const { exchange, symbol, interval } = message;

    if (!exchange || !symbol || !interval) {
      this.sendError(ws, 'Missing unsubscribe params: exchange, symbol, interval');
      return;
    }

    const subscriptionKey = this.getSubscriptionKey(exchange, symbol, interval);
    const clients = this.subscriptions.get(subscriptionKey);

    if (clients) {
      clients.delete(ws);

      if (clients.size === 0) {
        this.subscriptions.delete(subscriptionKey);
        this.removeIntervalFromMarketStream(exchange, symbol, interval);
      }
    }

    this.sendMessage(ws, {
      type: 'unsubscribed',
      exchange,
      symbol,
      interval,
    });
  }

  private async ensureMarketStream(exchange: string, symbol: string, interval: string) {
    const adapter = this.exchangeAdapters.get(exchange);

    if (!adapter) {
      throw new Error(`Missing exchange adapter: ${exchange}`);
    }

    const marketKey = this.getMarketKey(exchange, symbol);
    let entry = this.marketStreams.get(marketKey);

    if (!entry) {
      const stream = new MarketTradeStream({
        exchange,
        symbol,
        subscribeTrades: (activeSymbol, callback) => adapter.subscribeTrades(activeSymbol, callback),
        loadSeedKline: async (activeInterval) => {
          return klineService.getLatestCachedKline(exchange, symbol, activeInterval);
        },
        onEmitPrice: (priceUpdate) => {
          this.broadcastPrice(exchange, symbol, priceUpdate);
        },
        onEmitKline: (kline) => {
          this.broadcastKline(exchange, symbol, kline.interval, kline);
        },
        persistClosedKlines: async (klines) => {
          await this.persistRealtimeKlines(klines);
        },
        checkpointOpenKlines: async (klines) => {
          await this.persistRealtimeKlines(klines);
        },
        recoverGapKlines: async (activeInterval, fromExclusiveOpenTime, toExclusiveOpenTime) => {
          return klineService.recoverGapKlines(
            exchange,
            symbol,
            activeInterval,
            fromExclusiveOpenTime,
            toExclusiveOpenTime,
          );
        },
      });

      entry = {
        exchange,
        symbol,
        stream,
      };

      this.marketStreams.set(marketKey, entry);
    }

    await entry.stream.addInterval(interval);
  }

  private removeIntervalFromMarketStream(exchange: string, symbol: string, interval: string) {
    const marketKey = this.getMarketKey(exchange, symbol);
    const entry = this.marketStreams.get(marketKey);

    if (!entry) {
      return;
    }

    entry.stream.removeInterval(interval);

    if (this.getActiveIntervalsForMarket(exchange, symbol).length === 0) {
      entry.stream.close();
      this.marketStreams.delete(marketKey);
    }
  }

  private getActiveIntervalsForMarket(exchange: string, symbol: string): string[] {
    const prefix = `${exchange}:${symbol}:`;
    return [...this.subscriptions.keys()]
      .filter((key) => key.startsWith(prefix));
  }

  private broadcastKline(exchange: string, symbol: string, interval: string, kline: Kline) {
    const subscriptionKey = this.getSubscriptionKey(exchange, symbol, interval);
    const subscribers = this.subscriptions.get(subscriptionKey);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const payload = JSON.stringify({
      type: 'kline',
      exchange,
      symbol,
      interval,
      data: kline,
    } satisfies WsMessage);

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  private async persistRealtimeKlines(klines: Kline[]) {
    if (klines.length === 0) return;

    try {
      await klineService.saveKlines(klines);
      await syncStateService.batchRecordRealtimeSync(klines);
    } catch (error) {
      console.error('Failed to persist realtime kline batch:', error);
      await Promise.all(
        klines.map(async (kline) => {
          await syncStateService.recordRealtimeSyncError(kline, error);
        }),
      );
    }
  }

  private broadcastPrice(exchange: string, symbol: string, priceUpdate: PriceUpdate) {
    const subscribers = new Set<WebSocket>();

    this.subscriptions.forEach((clients, key) => {
      if (!key.startsWith(`${exchange}:${symbol}:`)) {
        return;
      }

      clients.forEach((ws) => subscribers.add(ws));
    });

    if (subscribers.size === 0) {
      return;
    }

    const payload = JSON.stringify({
      type: 'price',
      exchange,
      symbol,
      data: priceUpdate,
    } satisfies WsMessage);

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  private sendMessage(ws: WebSocket, message: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendMessage(ws, {
      type: 'error',
      error,
    });
  }

  private cleanupSubscriptions(ws: WebSocket) {
    this.subscriptions.forEach((clients, key) => {
      if (!clients.delete(ws)) {
        return;
      }

      if (clients.size > 0) {
        return;
      }

      this.subscriptions.delete(key);
      const [exchange, symbol, interval] = key.split(':');
      this.removeIntervalFromMarketStream(exchange, symbol, interval);
    });
  }

  close() {
    this.marketStreams.forEach((entry) => {
      entry.stream.close();
    });
    this.marketStreams.clear();

    this.clients.forEach((ws) => {
      ws.close();
    });

    this.wss.close();

    this.exchangeAdapters.forEach((adapter) => {
      adapter.closeAll?.();
    });
  }

  private getMarketKey(exchange: string, symbol: string): string {
    return `${exchange}:${symbol}`;
  }

  private getSubscriptionKey(exchange: string, symbol: string, interval: string): string {
    return `${exchange}:${symbol}:${interval}`;
  }
}
