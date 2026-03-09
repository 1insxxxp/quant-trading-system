export interface Kline {
  exchange: string;
  symbol: string;
  interval: string;
  open_time: number;
  close_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
  trades_count?: number;
  is_closed: number;
}

export type KlineSource = 'cache' | 'remote';

export interface KlineQueryResult {
  klines: Kline[];
  source: KlineSource;
  hasMore: boolean;
}

export interface SymbolInfo {
  exchange: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  type: string;
  status: string;
}

export interface TradeTick {
  exchange: string;
  symbol: string;
  price: number;
  quantity: number;
  quote_volume: number;
  timestamp: number;
}

export interface ExchangeAdapter {
  getKlines(
    symbol: string,
    interval: string,
    limit: number,
    before?: number,
  ): Promise<Kline[]>;
  subscribeTrades(
    symbol: string,
    callback: (trade: TradeTick) => void,
  ): () => void;
  subscribeKline(
    symbol: string,
    interval: string,
    callback: (kline: Kline) => void,
  ): () => void;
  subscribePrice(
    symbol: string,
    callback: (price: number) => void,
  ): () => void;
  getSymbols(): Promise<SymbolInfo[]>;
  closeAll?: () => void;
}

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

export interface KlineResponse {
  success: boolean;
  klines?: Kline[];
  source?: KlineSource;
  hasMore?: boolean;
  error?: string;
}

export interface SymbolResponse {
  success: boolean;
  symbols?: SymbolInfo[];
  error?: string;
}
