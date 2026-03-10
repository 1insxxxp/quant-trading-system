import { describe, expect, it, vi } from 'vitest';
import { OKXAdapter } from './okx.js';
import { createExchangeTransportConfig } from '../network/exchange-transport.js';

class FakeWebSocket {
  static calls: Array<{ url: string; options: Record<string, unknown> | undefined }> = [];
  static behaviors: Array<'open' | 'error-before-open'> = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  constructor(url: string, options?: Record<string, unknown>) {
    FakeWebSocket.calls.push({ url, options });
    const behavior = FakeWebSocket.behaviors.shift() ?? 'open';

    queueMicrotask(() => {
      if (behavior === 'error-before-open') {
        this.onerror?.(new Error('handshake failed'));
        this.onclose?.();
        return;
      }

      this.onopen?.();
    });
  }

  send() {}

  close() {
    this.onclose?.();
  }
}

describe('OKXAdapter transport routing', () => {
  it('uses direct REST and proxy WebSocket attempts by default in auto mode', async () => {
    FakeWebSocket.calls = [];
    FakeWebSocket.behaviors = [];
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
});
