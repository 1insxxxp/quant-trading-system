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
}

interface MarketSocketClient {
  disconnect: () => void;
}

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
}: MarketSocketClientOptions): MarketSocketClient {
  let socket: SocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
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
      activeSocket.send(JSON.stringify({
        type: 'subscribe',
        exchange: subscription.exchange,
        symbol: subscription.symbol,
        interval: subscription.interval,
      }));
    };

    activeSocket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data) as MarketSocketMessage);
      } catch (error) {
        onError(error);
      }
    };

    activeSocket.onerror = (error) => {
      onError(error);
    };

    activeSocket.onclose = () => {
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

      const activeSocket = socket;
      socket = null;
      activeSocket?.close();
    },
  };
}
