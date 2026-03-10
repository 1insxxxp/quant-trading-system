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

export interface PriceUpdate {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
}

export type KlineSource = 'remote' | 'cache' | 'demo' | 'empty';

export interface SymbolOption {
  value: string;
  label: string;
}

export type IndicatorId = 'volume' | 'ma5' | 'ma10' | 'ma20';

export type IndicatorSettings = Record<IndicatorId, boolean>;

export interface MarketState {
  exchange: string;
  symbol: string;
  interval: string;
  klines: Kline[];
  klineSource: KlineSource;
  latestPrice: number | null;
  lastPriceTimestamp: number | null;
  isConnected: boolean;
  symbols: SymbolOption[];
  isLoadingSymbols: boolean;
  isLoadingKlines: boolean;
  isLoadingOlderKlines: boolean;
  hasMoreHistoricalKlines: boolean;
  indicatorSettings: IndicatorSettings;
  isLoadingIndicatorSettings: boolean;
  indicatorPreferencesUnavailable: boolean;

  setExchange: (exchange: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
  setKlines: (klines: Kline[]) => void;
  updateKline: (kline: Kline) => void;
  setLatestPrice: (price: number, timestamp?: number) => void;
  setIsConnected: (connected: boolean) => void;
  loadInitialKlines: () => Promise<void>;
  loadOlderKlines: () => Promise<void>;
  fetchSymbols: () => Promise<void>;
  fetchIndicatorSettings: () => Promise<void>;
  updateIndicatorSetting: (indicatorId: IndicatorId, enabled: boolean) => Promise<void>;
}
