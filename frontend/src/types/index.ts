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

export type KlineSource = 'remote' | 'cache' | 'demo' | 'empty';

export interface SymbolOption {
  value: string;
  label: string;
}

export interface MarketState {
  exchange: string;
  symbol: string;
  interval: string;
  klines: Kline[];
  klineSource: KlineSource;
  latestPrice: number | null;
  isConnected: boolean;
  symbols: SymbolOption[];
  isLoadingSymbols: boolean;
  isLoadingKlines: boolean;
  isLoadingOlderKlines: boolean;
  hasMoreHistoricalKlines: boolean;

  setExchange: (exchange: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
  setKlines: (klines: Kline[]) => void;
  updateKline: (kline: Kline) => void;
  setLatestPrice: (price: number) => void;
  setIsConnected: (connected: boolean) => void;
  loadInitialKlines: () => Promise<void>;
  loadOlderKlines: () => Promise<void>;
  fetchSymbols: () => Promise<void>;
}
