import { describe, expect, it, vi } from 'vitest';
import { OKXAdapter } from './okx.js';
import { createExchangeTransportConfig } from '../network/exchange-transport.js';

class FakeWebSocket {
  static calls: Array<{ url: string; options: Record<string, unknown> | undefined }> = [];
  static behaviors: Array<'open' | 'error-before-open'> = [];
  static sentMessages: string[] = [];
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(url: string, options?: Record<string, unknown>) {
    FakeWebSocket.calls.push({ url, options });
    FakeWebSocket.instances.push(this);
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

  terminate() {
    this.close();
  }

  triggerMessage(data: string) {
    this.emit('message', Buffer.from(data));
    this.onmessage?.({ data });
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
    vi.useFakeTimers();
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = ['error-before-open', 'open'];
    FakeWebSocket.instances = [];
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
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeWebSocket.calls).toHaveLength(2);
    expect(FakeWebSocket.calls[0].options?.agent).toBeDefined();
    expect(FakeWebSocket.calls[1].options?.agent).toBeUndefined();
    vi.useRealTimers();
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

  it('reconnects after an established socket closes unexpectedly', async () => {
    vi.useFakeTimers();
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = ['open', 'open'];
    FakeWebSocket.instances = [];

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

    expect(FakeWebSocket.calls).toHaveLength(1);

    FakeWebSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(3000);

    expect(FakeWebSocket.calls).toHaveLength(2);
    expect(FakeWebSocket.calls[1].options?.agent).toBeDefined();
    vi.useRealTimers();
  });

  it('reconnects after the trade stream stays idle past the watchdog timeout', async () => {
    vi.useFakeTimers();
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = ['open', 'open'];
    FakeWebSocket.instances = [];

    const adapter = new OKXAdapter({
      transportConfig: createExchangeTransportConfig({
        EXCHANGE_WS_TRANSPORT: 'direct',
      }),
      httpGet: vi.fn(),
      WebSocketCtor: FakeWebSocket as never,
      wsIdleTimeoutMs: 1_000,
      wsReconnectDelayMs: 1,
    });

    adapter.subscribeTrades('ETHUSDT', vi.fn());
    await Promise.resolve();

    expect(FakeWebSocket.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(FakeWebSocket.calls).toHaveLength(2);
    vi.useRealTimers();
  });
});
