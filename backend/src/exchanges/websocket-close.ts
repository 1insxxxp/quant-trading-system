import WebSocket from 'ws';

const INTENTIONALLY_ABORTED_CONNECTING_SOCKETS = new WeakSet<WebSocket>();
const CLOSE_BEFORE_CONNECT_MESSAGE = 'WebSocket was closed before the connection was established';

export function safeCloseWebSocket(ws: WebSocket | null | undefined) {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    return;
  }

  if (ws.readyState === WebSocket.CONNECTING) {
    INTENTIONALLY_ABORTED_CONNECTING_SOCKETS.add(ws);
    ws.terminate();
    return;
  }

  ws.close();
}

export function isBenignCloseBeforeConnectError(error: unknown, ws?: WebSocket | null) {
  if (!ws || !INTENTIONALLY_ABORTED_CONNECTING_SOCKETS.has(ws)) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes(CLOSE_BEFORE_CONNECT_MESSAGE);
}
