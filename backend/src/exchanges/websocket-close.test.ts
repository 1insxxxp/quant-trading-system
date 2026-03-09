import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { isBenignCloseBeforeConnectError, safeCloseWebSocket } from './websocket-close.js';

describe('websocket-close', () => {
  it('terminates sockets that are still connecting instead of calling close', () => {
    const ws = {
      readyState: WebSocket.CONNECTING,
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as WebSocket;

    safeCloseWebSocket(ws);

    expect(ws.terminate).toHaveBeenCalledTimes(1);
    expect(ws.close).not.toHaveBeenCalled();
  });

  it('treats close-before-connect websocket errors as benign', () => {
    const ws = {
      readyState: WebSocket.CONNECTING,
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as WebSocket;

    safeCloseWebSocket(ws);

    expect(
      isBenignCloseBeforeConnectError(
        new Error('WebSocket was closed before the connection was established'),
        ws,
      ),
    ).toBe(true);
  });

  it('does not hide unrelated websocket errors', () => {
    expect(isBenignCloseBeforeConnectError(new Error('socket hang up'))).toBe(false);
  });

  it('does not hide close-before-connect errors for sockets we did not intentionally stop', () => {
    const ws = {
      readyState: WebSocket.CONNECTING,
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as WebSocket;

    expect(
      isBenignCloseBeforeConnectError(
        new Error('WebSocket was closed before the connection was established'),
        ws,
      ),
    ).toBe(false);
  });

  it('recognizes benign close-before-connect errors wrapped in an event object', () => {
    const ws = {
      readyState: WebSocket.CONNECTING,
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as WebSocket;

    safeCloseWebSocket(ws);

    expect(
      isBenignCloseBeforeConnectError(
        {
          error: new Error('WebSocket was closed before the connection was established'),
        },
        ws,
      ),
    ).toBe(true);
  });
});
