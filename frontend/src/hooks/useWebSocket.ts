import { useEffect, useRef } from 'react';
import { useMarketStore } from '../stores/marketStore';
import type { Kline } from '../types/index';

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    exchange,
    symbol,
    interval,
    updateKline,
    setLatestPrice,
    setIsConnected,
    fetchKlines,
  } = useMarketStore();

  useEffect(() => {
    console.log(`🔄 WebSocket 重新连接：${exchange} ${symbol} ${interval}`);
    
    // 关闭旧连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    // 连接 WebSocket
    const wsUrl = `ws://localhost:4001`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket 已连接');
      setIsConnected(true);

      // 订阅 K 线
      const subscribeMsg = {
        type: 'subscribe' as const,
        exchange,
        symbol,
        interval,
      };
      ws.send(JSON.stringify(subscribeMsg));
      console.log(`📡 已发送订阅：${exchange} ${symbol} ${interval}`);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());

        switch (message.type) {
          case 'kline':
            const kline: Kline = message.data;
            console.log('📊 收到 K 线更新:', kline.close);
            updateKline(kline);
            
            // 更新最新价格
            if (kline.close) {
              setLatestPrice(kline.close);
            }
            break;

          case 'subscribed':
            console.log(`✅ 已订阅：${message.exchange} ${message.symbol} ${message.interval}`);
            // 订阅成功后立即加载历史数据
            console.log('📥 开始加载历史 K 线...');
            fetchKlines();
            break;

          case 'error':
            console.error('❌ WebSocket 错误:', message.error);
            break;
        }
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 错误:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket 已断开');
      setIsConnected(false);

      // 3 秒后尝试重连
      setTimeout(() => {
        console.log('🔄 尝试重连...');
      }, 3000);
    };

    return () => {
      if (wsRef.current) {
        console.log('🔌 清理旧连接');
        wsRef.current.close();
      }
    };
  }, [exchange, symbol, interval]); // 当切换交易所/交易对/周期时重新连接

  return null;
};
