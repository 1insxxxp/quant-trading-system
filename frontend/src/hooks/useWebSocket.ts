import { useEffect } from 'react';
import { createSingleFlightRunner } from '../lib/singleFlight';
import { createMarketSocketClient, type MarketSocketMessage } from '../lib/marketSocket';
import { getMarketKey, useMarketStore } from '../stores/marketStore';
import type { Kline, PriceUpdate } from '../types/index';

const FALLBACK_POLL_INTERVAL_MS = 1200;
const PRICE_FALLBACK_INTERVAL = '1m';
const PRICE_STALE_THRESHOLD_MS = 5_000;

export const useWebSocket = () => {
  const exchange = useMarketStore((state) => state.exchange);
  const symbol = useMarketStore((state) => state.symbol);
  const interval = useMarketStore((state) => state.interval);
  const isConnected = useMarketStore((state) => state.isConnected);
  const lastPriceTimestamp = useMarketStore((state) => state.lastPriceTimestamp);
  const isLoadingKlines = useMarketStore((state) => state.isLoadingKlines);
  const updateKline = useMarketStore((state) => state.updateKline);
  const setLatestPrice = useMarketStore((state) => state.setLatestPrice);
  const setIsConnected = useMarketStore((state) => state.setIsConnected);
  const loadInitialKlines = useMarketStore((state) => state.loadInitialKlines);
  const hasStalePrice = (
    typeof lastPriceTimestamp !== 'number' ||
    Date.now() - lastPriceTimestamp > PRICE_STALE_THRESHOLD_MS
  );

  useEffect(() => {
    void loadInitialKlines();

    const marketKey = getMarketKey(exchange, symbol, interval);
    const wsUrl = resolveWebSocketUrl();

    const client = createMarketSocketClient({
      url: wsUrl,
      subscription: {
        exchange,
        symbol,
        interval,
      },
      onConnected: () => {
        setIsConnected(true);
      },
      onDisconnected: () => {
        setIsConnected(false);
      },
      onMessage: (message: MarketSocketMessage) => {
        const activeState = useMarketStore.getState();
        const activeMarketKey = getMarketKey(
          activeState.exchange,
          activeState.symbol,
          activeState.interval,
        );

        if (activeMarketKey !== marketKey) {
          return;
        }

        switch (message.type) {
          case 'price': {
            const priceUpdate = message.data as PriceUpdate;

            if (
              message.exchange !== exchange ||
              message.symbol !== symbol
            ) {
              return;
            }

            setLatestPrice(priceUpdate.price, priceUpdate.timestamp);
            break;
          }

          case 'kline': {
            const kline = message.data as Kline;

            if (
              message.exchange !== exchange ||
              message.symbol !== symbol ||
              message.interval !== interval
            ) {
              return;
            }

            updateKline(kline);
            break;
          }

          case 'error':
            console.error('WebSocket message error:', message.error);
            break;
        }
      },
      onError: (error) => {
        console.error('WebSocket transport error:', error);
      },
    });

    return () => {
      client.disconnect();
    };
  }, [exchange, symbol, interval]);

  useEffect(() => {
    // Only poll for price when klines are loaded; avoid kline polling conflicting with initial load
    const shouldPollPrice = !isLoadingKlines && (!isConnected || hasStalePrice);

    if (!shouldPollPrice) {
      return undefined;
    }

    let disposed = false;
    const abortController = new AbortController();
    const runSingleFlightPoll = createSingleFlightRunner();
    const marketKey = getMarketKey(exchange, symbol, interval);

    const pollLatestPrice = async () => {
      try {
        const response = await fetch(
          `/quant/api/klines?exchange=${exchange}&symbol=${symbol}&interval=${PRICE_FALLBACK_INTERVAL}&limit=1`,
          {
            signal: abortController.signal,
            cache: 'no-store',
          },
        );
        const payload = await response.json() as {
          success?: boolean;
          klines?: Kline[];
        };

        if (
          disposed ||
          abortController.signal.aborted ||
          getMarketKey(useMarketStore.getState().exchange, useMarketStore.getState().symbol, useMarketStore.getState().interval) !== marketKey
        ) {
          return;
        }

        if (payload.success !== true || !Array.isArray(payload.klines) || payload.klines.length === 0) {
          return;
        }

        const latest = payload.klines[payload.klines.length - 1];
        if (latest) {
          setLatestPrice(latest.close, Date.now());
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
      }
    };

    void runSingleFlightPoll(pollLatestPrice);
    const timer = window.setInterval(() => {
      void runSingleFlightPoll(pollLatestPrice);
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      abortController.abort();
      window.clearInterval(timer);
    };
  }, [exchange, symbol, interval, isConnected, isLoadingKlines, hasStalePrice, setLatestPrice]);

  return null;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function resolveWebSocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;

  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (import.meta.env.DEV && isLocalHost) {
    return `${wsProtocol}//${window.location.hostname}:4001/quant/ws`;
  }

  return `${wsProtocol}//${window.location.host}/quant/ws`;
}
