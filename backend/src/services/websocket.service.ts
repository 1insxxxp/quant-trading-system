import WebSocket, { WebSocketServer } from 'ws';
import type { Kline, WsMessage } from '../types/index.js';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { ExchangeAdapter } from '../types/index.js';

interface Subscription {
  exchange: string;
  symbol: string;
  interval: string;
  unsubscribe?: () => void;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private subscriptions: Map<string, Set<WebSocket>> = new Map(); // key: exchange:symbol:interval
  private exchangeAdapters: Map<string, ExchangeAdapter> = new Map();
  private activeSubscriptions: Map<string, Subscription> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.initExchanges();
    this.setupServer();
    console.log(`✅ WebSocket 服务已启动 (ws://localhost:${port})`);
  }

  private initExchanges() {
    this.exchangeAdapters.set('binance', new BinanceAdapter());
    this.exchangeAdapters.set('okx', new OKXAdapter());
  }

  private setupServer() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`🔌 新客户端连接，当前连接数：${this.clients.size}`);

      ws.on('message', (data) => {
        try {
          const message: WsMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error: any) {
          this.sendError(ws, `解析消息失败：${error.message}`);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.cleanupSubscriptions(ws);
        console.log(`🔌 客户端断开，当前连接数：${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
      });

      // 发送欢迎消息
      this.sendMessage(ws, {
        type: 'connected',
        data: { message: '已连接到量化交易 WebSocket 服务' },
      });
    });
  }

  private handleMessage(ws: WebSocket, message: WsMessage) {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(ws, message);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, message);
        break;
      default:
        this.sendError(ws, `未知消息类型：${message.type}`);
    }
  }

  private handleSubscribe(ws: WebSocket, message: WsMessage) {
    const { exchange, symbol, interval } = message;

    if (!exchange || !symbol || !interval) {
      this.sendError(ws, '订阅参数不完整：需要 exchange, symbol, interval');
      return;
    }

    const key = `${exchange}:${symbol}:${interval}`;
    
    // 记录订阅关系
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(ws);

    // 如果是第一次订阅这个组合，开始从交易所订阅
    if (!this.activeSubscriptions.has(key)) {
      this.startExchangeSubscription(exchange, symbol, interval);
    }

    console.log(`📡 订阅：${key}，当前订阅数：${this.subscriptions.get(key)!.size}`);

    this.sendMessage(ws, {
      type: 'subscribed',
      exchange,
      symbol,
      interval,
    });
  }

  private handleUnsubscribe(ws: WebSocket, message: WsMessage) {
    const { exchange, symbol, interval } = message;

    if (!exchange || !symbol || !interval) {
      this.sendError(ws, '取消订阅参数不完整');
      return;
    }

    const key = `${exchange}:${symbol}:${interval}`;
    
    if (this.subscriptions.has(key)) {
      this.subscriptions.get(key)!.delete(ws);
      
      // 如果没有订阅者了，取消交易所订阅
      if (this.subscriptions.get(key)!.size === 0) {
        this.stopExchangeSubscription(key);
      }
    }

    this.sendMessage(ws, {
      type: 'unsubscribed',
      exchange,
      symbol,
      interval,
    });
  }

  private startExchangeSubscription(exchange: string, symbol: string, interval: string) {
    const key = `${exchange}:${symbol}:${interval}`;
    const adapter = this.exchangeAdapters.get(exchange);

    if (!adapter) {
      console.error(`❌ 未找到交易所适配器：${exchange}`);
      return;
    }

    console.log(`🚀 开始订阅 ${exchange} ${symbol} ${interval} 实时 K 线...`);

    // 订阅 K 线
    const unsubscribe = adapter.subscribeKline(symbol, interval, (kline: Kline) => {
      // 广播给所有订阅的客户端
      this.broadcastKline(exchange, symbol, interval, kline);
    });

    this.activeSubscriptions.set(key, {
      exchange,
      symbol,
      interval,
      unsubscribe,
    });
  }

  private stopExchangeSubscription(key: string) {
    const subscription = this.activeSubscriptions.get(key);
    
    if (subscription && subscription.unsubscribe) {
      subscription.unsubscribe();
      this.activeSubscriptions.delete(key);
      console.log(`🛑 停止订阅：${key}`);
    }
  }

  private broadcastKline(exchange: string, symbol: string, interval: string, kline: Kline) {
    const key = `${exchange}:${symbol}:${interval}`;
    const subscribers = this.subscriptions.get(key);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message: WsMessage = {
      type: 'kline',
      exchange,
      symbol,
      interval,
      data: kline,
    };

    const data = JSON.stringify(message);
    
    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
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
      clients.delete(ws);
      
      if (clients.size === 0) {
        this.stopExchangeSubscription(key);
        this.subscriptions.delete(key);
      }
    });
  }

  // 关闭服务
  close() {
    // 取消所有交易所订阅
    this.activeSubscriptions.forEach((subscription, key) => {
      this.stopExchangeSubscription(key);
    });

    // 关闭所有客户端连接
    this.clients.forEach((ws) => {
      ws.close();
    });

    // 关闭 WebSocket 服务器
    this.wss.close();
    
    // 关闭交易所适配器
    this.exchangeAdapters.forEach((adapter) => {
      adapter.closeAll?.();
    });

    console.log('🛑 WebSocket 服务已关闭');
  }
}
