import { useEffect } from 'react';
import { createMarketSocketClient, type MarketSocketMessage } from '../lib/marketSocket';
import { getMarketKey, useMarketStore } from '../stores/marketStore';
import type { Kline } from '../types/index';

export const useWebSocket = () => {
  const {
    exchange,
    symbol,
    interval,
    updateKline,
    setLatestPrice,
    setIsConnected,
    loadInitialKlines,
  } = useMarketStore();

  useEffect(() => {
    void loadInitialKlines();

    const marketKey = getMarketKey(exchange, symbol, interval);
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/quant/ws`;

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

            if (kline.close) {
              setLatestPrice(kline.close);
            }
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
  }, [exchange, symbol, interval, loadInitialKlines, setIsConnected, setLatestPrice, updateKline]);

  return null;
};
