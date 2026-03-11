import { describe, expect, it, vi } from 'vitest';
import { OKXAdapter } from './okx.js';
import { createExchangeTransportConfig } from '../network/exchange-transport.js';

class FakeWebSocket {
  static calls: Array<{ url: string; options: Record<string, unknown> | undefined }> = [];
  static behaviors: Array<'open' | 'error-before-open'> = [];
  static sentMessages: string[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(url: string, options?: Record<string, unknown>) {
    FakeWebSocket.calls.push({ url, options });
    const behavior = FakeWebSocket.behaviors.shift() ?? 'open';

    queueMicrotask(() => {
      if (behavior === 'error-before-open') {
        this.emit('error', new Error('handshake failed'));
        this.onerror?.(new Error('handshake failed'));
        this.emit('close');
        this.onclose?.();
        return;
      }

      this.emit('open');
      this.onopen?.();
    });
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.listeners[event] ??= [];
    this.listeners[event].push(handler);
    return this;
  }

  once(event: string, handler: (...args: any[]) => void) {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter((item) => item !== handler);
    return this;
  }

  send(payload?: string) {
    if (payload) {
      FakeWebSocket.sentMessages.push(payload);
    }
  }

  close() {
    this.emit('close');
    this.onclose?.();
  }

  private emit(event: string, ...args: any[]) {
    for (const handler of this.listeners[event] ?? []) {
      handler(...args);
    }
  }
}

describe('OKXAdapter transport routing', () => {
  it('uses direct REST and proxy WebSocket attempts by default in auto mode', async () => {
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = [];
    FakeWebSocket.sentMessages = [];
    const httpGet = vi.fn().mockResolvedValue({
      data: {
        data: [['1', '1', '2', '0.5', '1.5', '10', '15']],
      },
    });
    const adapter = new OKXAdapter({
      transportConfig: createExchangeTransportConfig({
        EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
      }),
      httpGet,
      WebSocketCtor: FakeWebSocket as never,
    });

    await adapter.getKlines('ETHUSDT', '1h', 1);
    adapter.subscribeTrades('ETHUSDT', vi.fn());

    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(httpGet.mock.calls[0][1].httpAgent).toBeUndefined();
    expect(httpGet.mock.calls[0][1].httpsAgent).toBeUndefined();
    expect(FakeWebSocket.calls[0].options?.agent).toBeDefined();
  });

  it('falls back from proxy WebSocket to direct WebSocket in auto mode', async () => {
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = ['error-before-open', 'open'];
    const httpGet = vi.fn();
    const adapter = new OKXAdapter({
      transportConfig: createExchangeTransportConfig({
        EXCHANGE_WS_TRANSPORT: 'auto',
        EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
      }),
      httpGet,
      WebSocketCtor: FakeWebSocket as never,
    });

    adapter.subscribeTrades('ETHUSDT', vi.fn());
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeWebSocket.calls).toHaveLength(2);
    expect(FakeWebSocket.calls[0].options?.agent).toBeDefined();
    expect(FakeWebSocket.calls[1].options?.agent).toBeUndefined();
  });

  it('sends the okx subscribe payload after the socket opens', async () => {
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = ['open'];
    FakeWebSocket.sentMessages = [];
    const adapter = new OKXAdapter({
      transportConfig: createExchangeTransportConfig({
        EXCHANGE_WS_TRANSPORT: 'proxy',
        EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
      }),
      httpGet: vi.fn(),
      WebSocketCtor: FakeWebSocket as never,
    });

    adapter.subscribeTrades('ETHUSDT', vi.fn());
    await Promise.resolve();

    expect(FakeWebSocket.sentMessages).toContain(
      JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'trades', instId: 'ETH-USDT' }],
      }),
    );
  });
});
