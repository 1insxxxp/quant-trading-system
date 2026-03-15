export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

interface MarketSubscription {
  exchange: string;
  symbol: string;
  interval: string;
}

export interface MarketSocketMessage {
  type: string;
  exchange?: string;
  symbol?: string;
  interval?: string;
  data?: unknown;
  error?: string;
}

interface MarketSocketClientOptions {
  url: string;
  subscription: MarketSubscription;
  reconnectDelayMs?: number;
  createSocket?: SocketFactory;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (message: MarketSocketMessage) => void;
  onError: (error: unknown) => void;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

interface MarketSocketClient {
  disconnect: () => void;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 25000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10000;

export function createMarketSocketClient({
  url,
  subscription,
  reconnectDelayMs = 3000,
  createSocket = (socketUrl) => new WebSocket(socketUrl) as unknown as SocketLike,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onConnected,
  onDisconnected,
  onMessage,
  onError,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
}: MarketSocketClientOptions): MarketSocketClient {
  let socket: SocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearHeartbeatTimers = () => {
    if (heartbeatTimer !== null) {
      clearTimeoutFn(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeoutTimer !== null) {
      clearTimeoutFn(heartbeatTimeoutTimer);
      heartbeatTimeoutTimer = null;
    }
  };

  const scheduleHeartbeat = () => {
    if (disposed || heartbeatTimer !== null) {
      return;
    }

    heartbeatTimer = setTimeoutFn(() => {
      if (disposed || socket?.readyState !== 1) {
        return;
      }

      try {
        socket.send(JSON.stringify({ type: 'ping' }));

        heartbeatTimeoutTimer = setTimeoutFn(() => {
          if (!disposed) {
            console.warn('WebSocket heartbeat timeout, reconnecting...');
            socket?.close();
          }
        }, heartbeatTimeoutMs);
      } catch (error) {
        onError(error);
      }
    }, heartbeatIntervalMs);
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== null) {
      return;
    }

    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  };

  const connect = () => {
    if (disposed) {
      return;
    }

    const activeSocket = createSocket(url);
    socket = activeSocket;

    activeSocket.onopen = () => {
      onConnected();
      scheduleHeartbeat();
      activeSocket.send(JSON.stringify({
        type: 'subscribe',
        exchange: subscription.exchange,
        symbol: subscription.symbol,
        interval: subscription.interval,
      }));
    };

    activeSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as MarketSocketMessage;

        if (data.type === 'pong') {
          if (heartbeatTimeoutTimer !== null) {
            clearTimeoutFn(heartbeatTimeoutTimer);
            heartbeatTimeoutTimer = null;
          }
          scheduleHeartbeat();
          return;
        }

        onMessage(data);
      } catch (error) {
        onError(error);
      }
    };

    activeSocket.onerror = (error) => {
      onError(error);
    };

    activeSocket.onclose = () => {
      clearHeartbeatTimers();

      if (socket === activeSocket) {
        socket = null;
      }

      onDisconnected();
      scheduleReconnect();
    };
  };

  connect();

  return {
    disconnect: () => {
      disposed = true;
      clearReconnectTimer();
      clearHeartbeatTimers();

      const activeSocket = socket;
      socket = null;
      activeSocket?.close();
    },
  };
}
