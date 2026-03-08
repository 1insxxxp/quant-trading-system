// K 线数据结构
export interface Kline {
  exchange: string;      // 'binance' | 'okx'
  symbol: string;        // 'BTCUSDT' | 'ETHUSDT'
  interval: string;      // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  open_time: number;     // K 线开始时间（毫秒）
  close_time: number;    // K 线结束时间（毫秒）
  open: number;          // 开盘价
  high: number;          // 最高价
  low: number;           // 最低价
  close: number;         // 收盘价
  volume: number;        // 成交量
  quote_volume: number;  // 成交额
  trades_count?: number; // 交易笔数
  is_closed: number;     // K 线是否关闭（0-未关闭，1-已关闭）
}

// 交易对信息
export interface SymbolInfo {
  exchange: string;      // 'binance' | 'okx'
  symbol: string;        // 'BTCUSDT' | 'ETHUSDT'
  base_asset: string;    // 'BTC' | 'ETH'
  quote_asset: string;   // 'USDT'
  type: string;          // 'spot' | 'futures'
  status: string;        // 'active' | 'delisted'
}

// 交易所适配器接口
export interface ExchangeAdapter {
  getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]>;
  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void
  ): () => void;
  subscribePrice(
    symbol: string,
    callback: (price: number) => void
  ): () => void;
  getSymbols(): Promise<SymbolInfo[]>;
  closeAll?: () => void;
}

// WebSocket 消息类型
export interface WsMessage {
  type:
    | 'subscribe'
    | 'unsubscribe'
    | 'subscribed'
    | 'unsubscribed'
    | 'connected'
    | 'kline'
    | 'price'
    | 'error';
  exchange?: string;
  symbol?: string;
  interval?: string;
  data?: Kline | number | { message: string };
  error?: string;
}

// API 响应类型
export interface KlineResponse {
  success: boolean;
  klines?: Kline[];
  error?: string;
}

export interface SymbolResponse {
  success: boolean;
  symbols?: SymbolInfo[];
  error?: string;
}
