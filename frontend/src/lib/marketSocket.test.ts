import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMarketSocketClient,
  type SocketFactory,
  type SocketLike,
} from './marketSocket';

class FakeSocket implements SocketLike {
  static readonly OPEN = 1;

  readyState = FakeSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  triggerOpen() {
    this.onopen?.();
  }

  triggerClose() {
    this.onclose?.();
  }
}

describe('marketSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('reconnects after an unexpected socket close', () => {
    const sockets: FakeSocket[] = [];
    const createSocket: SocketFactory = vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });

    createMarketSocketClient({
      url: 'ws://localhost:4001',
      subscription: {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: '1h',
      },
      createSocket,
      reconnectDelayMs: 3000,
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    expect(createSocket).toHaveBeenCalledTimes(1);

    sockets[0].triggerOpen();
    expect(sockets[0].sent).toContain(
      JSON.stringify({
        type: 'subscribe',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: '1h',
      }),
    );

    sockets[0].triggerClose();
    vi.advanceTimersByTime(3000);

    expect(createSocket).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect after an intentional disconnect', () => {
    const sockets: FakeSocket[] = [];
    const createSocket: SocketFactory = vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });

    const client = createMarketSocketClient({
      url: 'ws://localhost:4001',
      subscription: {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: '1h',
      },
      createSocket,
      reconnectDelayMs: 3000,
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    expect(createSocket).toHaveBeenCalledTimes(1);

    client.disconnect();
    vi.advanceTimersByTime(3000);

    expect(createSocket).toHaveBeenCalledTimes(1);
  });
});
