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

export interface FundingRate {
  exchange: string;
  symbol: string;
  fundingRate: number;
  fundingTimestamp: number;
  nextFundingTimestamp?: number;
  markPrice?: number;
  indexPrice?: number;
}

export interface PriceUpdate {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
}

export type KlineLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type KlineSource = 'remote' | 'cache' | 'demo' | 'empty';

export interface SymbolOption {
  value: string;
  label: string;
  baseAsset?: string;
  quoteAsset?: string;
}

export type IndicatorId = 'volume' | 'ma5' | 'ma10' | 'ma20' | 'ema12' | 'ema26' | 'rsi' | 'macd' | 'bollinger';

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
  olderKlineLoadError: string | null;
  hasMoreHistoricalKlines: boolean;
  indicatorSettings: IndicatorSettings;
  isLoadingIndicatorSettings: boolean;
  indicatorPreferencesUnavailable: boolean;
  fundingRate: FundingRate | null;
  isLoadingFundingRate: boolean;
  // 细化的加载状态
  klineLoadState: KlineLoadState;
  realtimeUpdateState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  // WebSocket 延迟监测
  wsLatency: number | null;
  wsLatencyStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  wsReconnectCount: number;
  // Toast 通知
  toasts: ToastMessage[];

  setExchange: (exchange: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
  setKlines: (klines: Kline[]) => void;
  mergeKlines: (klines: Kline[]) => void;
  updateKline: (kline: Kline) => void;
  setLatestPrice: (price: number, timestamp?: number) => void;
  setIsConnected: (connected: boolean) => void;
  setKlineLoadState: (state: KlineLoadState) => void;
  setRealtimeUpdateState: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => void;
  setWsLatency: (latency: number) => void;
  setWsReconnectCount: (count: number) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  loadInitialKlines: () => Promise<void>;
  loadOlderKlines: () => Promise<void>;
  retryLoadOlderKlines: () => Promise<void>;
  fetchSymbols: () => Promise<void>;
  fetchIndicatorSettings: () => Promise<void>;
  updateIndicatorSetting: (indicatorId: IndicatorId, enabled: boolean) => Promise<void>;
  fetchFundingRate: () => Promise<void>;
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}
