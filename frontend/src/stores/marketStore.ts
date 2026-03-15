import { create } from 'zustand';
import { formatMarketSymbol } from '../lib/marketDisplay.js';
import type {
  FundingRate,
  IndicatorId,
  IndicatorSettings,
  Kline,
  KlineLoadState,
  KlineSource,
  MarketState,
  SymbolOption,
  ToastMessage,
} from '../types/index.js';

let latestFetchToken = 0;
export const MARKET_SELECTION_STORAGE_KEY = 'quant-market-selection';
const INDICATOR_PREFERENCES_NOT_AVAILABLE = 'HTTP 404';
export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  volume: false,
  ma5: false,
  ma10: false,
  ma20: false,
};

const DEFAULT_SYMBOLS: SymbolOption[] = [
  { value: 'BTCUSDT', label: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
];

const DEFAULT_MARKET_SELECTION = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  interval: '1h',
} as const;
const INITIAL_KLINE_LIMIT = 500;
const OLDER_KLINE_PAGE_SIZE = 1000;
const DEFAULT_OLDER_KLINE_LOAD_ERROR = '加载历史K线失败，请重试。';

// K 线缓存：按 (exchange, symbol, interval) 存储已加载的 K 线数据
// 当用户切换周期后再返回时可以直接使用缓存，避免重复请求
interface KlineCacheEntry {
  klines: Kline[];
  source: KlineSource;
  latestPrice: number | null;
  lastPriceTimestamp: number | null;
  hasMoreHistoricalKlines: boolean;
  timestamp: number;
}
const KLINE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存
const klineCache = new Map<string, KlineCacheEntry>();

interface BackendSymbol {
  exchange?: string;
  symbol: string;
  base_asset?: string;
  quote_asset?: string;
  type?: string;
}

interface BackendKlineResponse {
  success: boolean;
  klines?: Kline[];
  source?: Exclude<KlineSource, 'empty'>;
  hasMore?: boolean;
  error?: string;
}

interface BackendSymbolsResponse {
  success: boolean;
  symbols?: BackendSymbol[];
  error?: string;
}

interface BackendIndicatorSettingsResponse {
  success: boolean;
  settings?: Partial<Record<IndicatorId, boolean>>;
  error?: string;
}

interface BackendFundingRateResponse {
  success: boolean;
  fundingRate?: FundingRate;
  error?: string;
}

export function getMarketKey(exchange: string, symbol: string, interval: string): string {
  return `${exchange}:${symbol}:${interval}`;
}

const initialSelection = readPersistedMarketSelection();

export const useMarketStore = create<MarketState>((set, get) => ({
  exchange: initialSelection.exchange,
  symbol: initialSelection.symbol,
  interval: initialSelection.interval,
  klines: [],
  klineSource: 'empty',
  latestPrice: null,
  lastPriceTimestamp: null,
  isConnected: false,
  symbols: DEFAULT_SYMBOLS,
  isLoadingSymbols: false,
  isLoadingKlines: false,
  isLoadingOlderKlines: false,
  olderKlineLoadError: null,
  hasMoreHistoricalKlines: true,
  indicatorSettings: { ...DEFAULT_INDICATOR_SETTINGS },
  isLoadingIndicatorSettings: false,
  indicatorPreferencesUnavailable: false,
  fundingRate: null,
  isLoadingFundingRate: false,
  klineLoadState: 'idle',
  realtimeUpdateState: 'disconnected',
  wsLatency: null,
  wsLatencyStatus: 'unknown' as const,
  wsReconnectCount: 0,
  toasts: [],

  setExchange: (exchange: string) => {
    set((state) => {
      writePersistedMarketSelection({
        exchange,
        symbol: state.symbol,
        interval: state.interval,
      });

      return {
        exchange,
        klines: [],
        klineSource: 'empty',
        latestPrice: null,
        lastPriceTimestamp: null,
        klineLoadState: 'loading',
        isLoadingKlines: true,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: true,
        fundingRate: null,
      };
    });
    void get().fetchSymbols();
    void get().fetchFundingRate();
    // 等待 fetchSymbols 完成后加载 K 线数据
    setTimeout(() => {
      void get().loadInitialKlines();
    }, 0);
  },

  setSymbol: (symbol: string) => {
    set((state) => {
      writePersistedMarketSelection({
        exchange: state.exchange,
        symbol,
        interval: state.interval,
      });

      return {
        symbol,
        klines: [],
        klineSource: 'empty',
        latestPrice: null,
        lastPriceTimestamp: null,
        klineLoadState: 'loading',
        isLoadingKlines: true,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: true,
      };
    });
    void get().loadInitialKlines();
    void get().fetchFundingRate();
  },

  setInterval: (interval: string) => {
    const { exchange, symbol } = get();
    const cacheKey = getMarketKey(exchange, symbol, interval);
    const cached = klineCache.get(cacheKey);
    const now = Date.now();
    const isCacheValid = cached && (now - cached.timestamp < KLINE_CACHE_TTL_MS);

    // 如果有有效的缓存，直接使用缓存数据
    if (isCacheValid && cached.klines.length > 0) {
      set({
        interval,
        klines: cached.klines,
        klineSource: cached.source,
        latestPrice: cached.latestPrice,
        lastPriceTimestamp: cached.lastPriceTimestamp,
        klineLoadState: 'loaded',
        isLoadingKlines: false,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: cached.hasMoreHistoricalKlines,
      });
      writePersistedMarketSelection({
        exchange,
        symbol,
        interval,
      });
      return;
    }

    // 缓存未命中，先设置加载状态，再加载数据
    set({
      interval,
      klines: [],
      klineSource: 'empty',
      latestPrice: null,
      lastPriceTimestamp: null,
      klineLoadState: 'loading',
      isLoadingKlines: true,
      isLoadingOlderKlines: false,
      olderKlineLoadError: null,
      hasMoreHistoricalKlines: true,
    });
    writePersistedMarketSelection({
      exchange,
      symbol,
      interval,
    });
    void get().loadInitialKlines();
  },

  setKlines: (klines: Kline[]) => {
    const normalizedKlines = normalizeKlines(klines);
    // 临时禁用验证以调试
    // const validKlines = filterValidKlines(normalizedKlines);
    const validKlines = normalizedKlines;
    set({
      klines: validKlines,
      klineSource: validKlines.length > 0 ? get().klineSource : 'empty',
    });
  },

  mergeKlines: (incomingKlines: Kline[]) => {
    set((state) => {
      const relevantKlines = incomingKlines.filter((kline) => (
        kline.exchange === state.exchange &&
        kline.symbol === state.symbol &&
        kline.interval === state.interval
      ));

      if (relevantKlines.length === 0) {
        return state;
      }

      // 临时禁用验证以调试
      // const validRelevantKlines = filterValidKlines(relevantKlines);
      const validRelevantKlines = relevantKlines;
      const nextKlines = normalizeKlines([...state.klines, ...validRelevantKlines]);
      const cacheKey = getMarketKey(state.exchange, state.symbol, state.interval);

      // 更新缓存
      const cached = klineCache.get(cacheKey);
      if (cached) {
        klineCache.set(cacheKey, {
          ...cached,
          klines: nextKlines,
          latestPrice: nextKlines[nextKlines.length - 1]?.close ?? cached.latestPrice,
          timestamp: Date.now(),
        });
      }

      return {
        klines: nextKlines,
        latestPrice: nextKlines[nextKlines.length - 1]?.close ?? state.latestPrice,
      };
    });
  },

  updateKline: (kline: Kline) => {
    const { klines, exchange, symbol, interval } = get();
    const cacheKey = getMarketKey(exchange, symbol, interval);

    if (
      kline.exchange !== exchange ||
      kline.symbol !== symbol ||
      kline.interval !== interval
    ) {
      return;
    }

    // 临时禁用验证以调试
    // const validation = validateKline(kline);
    // if (!validation.valid) {
    //   console.warn('Rejecting invalid realtime kline update:', validation.errors);
    //   return;
    // }

    // Skip synthetic gap placeholder candles (TradeAggregator fills time gaps with flat zero-volume candles)
    // These would corrupt existing REST API data by overwriting correct close/low values
    if (
      kline.is_closed === 1 &&
      kline.volume === 0 &&
      kline.quote_volume === 0 &&
      kline.open === kline.high &&
      kline.open === kline.low &&
      kline.open === kline.close
    ) {
      return;
    }

    const index = klines.findIndex((item) => item.open_time === kline.open_time);

    if (index >= 0) {
      const nextKlines = [...klines];
      nextKlines[index] = mergeRealtimeKline(nextKlines[index], kline);
      nextKlines.sort((a, b) => a.open_time - b.open_time);
      const latestPrice = nextKlines[nextKlines.length - 1]?.close ?? null;

      // 更新缓存
      const cached = klineCache.get(cacheKey);
      if (cached) {
        klineCache.set(cacheKey, {
          ...cached,
          klines: nextKlines,
          latestPrice,
          timestamp: Date.now(),
        });
      }

      set({
        klines: nextKlines,
        latestPrice,
      });
      return;
    }

    const nextKlines = [...klines, kline].sort((a, b) => a.open_time - b.open_time);
    const latestPrice = nextKlines[nextKlines.length - 1]?.close ?? null;

    // 更新缓存
    const cached = klineCache.get(cacheKey);
    if (cached) {
      klineCache.set(cacheKey, {
        ...cached,
        klines: nextKlines,
        latestPrice,
        timestamp: Date.now(),
      });
    }

    set({
      klines: nextKlines,
      latestPrice,
    });
  },

  setLatestPrice: (price: number, timestamp?: number) => {
    set((state) => {
      if (
        typeof timestamp === 'number' &&
        typeof state.lastPriceTimestamp === 'number' &&
        timestamp < state.lastPriceTimestamp
      ) {
        return state;
      }

      return {
        latestPrice: price,
        lastPriceTimestamp: typeof timestamp === 'number' ? timestamp : state.lastPriceTimestamp,
      };
    });
  },

  setIsConnected: (isConnected: boolean) => {
    set({ isConnected });
  },

  setKlineLoadState: (state: KlineLoadState) => {
    set({ klineLoadState: state });
  },

  setRealtimeUpdateState: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => {
    set({ realtimeUpdateState: state });
  },

  setWsLatency: (latency: number) => {
    set((state) => {
      const monitor = {
        latency,
        avgLatency: state.wsLatency,
        status: state.wsLatencyStatus,
      };

      // 简单计算延迟状态
      let newStatus: typeof state.wsLatencyStatus = 'unknown';
      if (latency > 0) {
        if (latency < 50) newStatus = 'excellent';
        else if (latency < 150) newStatus = 'good';
        else if (latency < 300) newStatus = 'fair';
        else newStatus = 'poor';
      }

      return {
        wsLatency: latency,
        wsLatencyStatus: newStatus,
      };
    });
  },

  setWsReconnectCount: (count: number) => {
    set({ wsReconnectCount: count });
  },

  addToast: (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
  },

  dismissToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  fetchFundingRate: async () => {
    const { exchange, symbol } = get();

    if (!exchange || !symbol) {
      return;
    }

    set({ isLoadingFundingRate: true });

    try {
      const response = await fetch(
        `/quant/api/funding-rate?exchange=${exchange}&symbol=${symbol}`,
      );
      const data = await readJsonResponse<BackendFundingRateResponse>(response);

      if (get().exchange !== exchange || get().symbol !== symbol) {
        return;
      }

      if (!data.success) {
        set({
          fundingRate: null,
          isLoadingFundingRate: false,
        });
        return;
      }

      set({
        fundingRate: data.fundingRate ?? null,
        isLoadingFundingRate: false,
      });
    } catch (error) {
      console.error('Failed to load funding rate:', error);
      set({
        fundingRate: null,
        isLoadingFundingRate: false,
      });
    }
  },

  loadInitialKlines: async () => {
    const { exchange, symbol, interval } = get();
    const marketKey = getMarketKey(exchange, symbol, interval);
    const cacheKey = getMarketKey(exchange, symbol, interval);
    const fetchToken = ++latestFetchToken;

    set({
      klineLoadState: 'loading',
      isLoadingKlines: true,
      isLoadingOlderKlines: false,
      olderKlineLoadError: null,
    });

    try {
      const initialResult = await fetchKlinePage({
        exchange,
        symbol,
        interval,
        limit: INITIAL_KLINE_LIMIT,
      });

      if (isStaleInitialRequest(fetchToken, marketKey, get)) {
        return;
      }

      if (!initialResult.success) {
        console.error('Failed to load klines:', initialResult.error);
        set({
          klineLoadState: 'error',
          klines: [],
          klineSource: 'empty',
          latestPrice: null,
          lastPriceTimestamp: null,
          isLoadingKlines: false,
          isLoadingOlderKlines: false,
          olderKlineLoadError: null,
          hasMoreHistoricalKlines: false,
        });
        return;
      }

      let initialKlines = normalizeKlines(initialResult.klines ?? []);
      // 临时禁用验证以调试
      // let validKlines = filterValidKlines(initialKlines);
      let validKlines = initialKlines;
      let hasMoreHistory = initialResult.hasMore ?? false;

      // 移除顺序加载循环，一次性返回可用数据，避免阻塞 UI 渲染
      // 历史数据会在用户滚动时通过 loadOlderKlines 懒加载

      const bufferedRealtimeKlines = getMarketKey(get().exchange, get().symbol, get().interval) === marketKey
        ? get().klines
        : [];
      const nextKlines = normalizeKlines([...validKlines, ...bufferedRealtimeKlines]);
      const source = resolveKlineSource(initialResult.source, nextKlines);
      const latestPrice = nextKlines[nextKlines.length - 1]?.close ?? null;

      // 缓存加载结果
      klineCache.set(cacheKey, {
        klines: nextKlines,
        source,
        latestPrice,
        lastPriceTimestamp: null,
        hasMoreHistoricalKlines: hasMoreHistory,
        timestamp: Date.now(),
      });

      set({
        klineLoadState: 'loaded',
        klines: nextKlines,
        klineSource: source,
        latestPrice,
        lastPriceTimestamp: null,
        isLoadingKlines: false,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: hasMoreHistory,
      });
    } catch (error) {
      if (isStaleInitialRequest(fetchToken, marketKey, get)) {
        return;
      }

      console.error('Failed to load klines:', error);
      set({
        klineLoadState: 'error',
        klines: [],
        klineSource: 'empty',
        latestPrice: null,
        lastPriceTimestamp: null,
        isLoadingKlines: false,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: false,
      });
    }
  },

  loadOlderKlines: async () => {
    const {
      exchange,
      symbol,
      interval,
      klines,
      isLoadingKlines,
      isLoadingOlderKlines,
      hasMoreHistoricalKlines,
    } = get();

    if (isLoadingKlines || isLoadingOlderKlines || !hasMoreHistoricalKlines || klines.length === 0) {
      return;
    }

    const marketKey = getMarketKey(exchange, symbol, interval);
    const earliestOpenTime = klines[0]?.open_time;

    if (typeof earliestOpenTime !== 'number') {
      return;
    }

    set({ isLoadingOlderKlines: true, olderKlineLoadError: null });

    try {
      // Pass earliestOpenTime directly - backend will fetch data ending at this timestamp
      const data = await fetchKlinePage({
        exchange,
        symbol,
        interval,
        limit: OLDER_KLINE_PAGE_SIZE,
        before: earliestOpenTime,
      });

      if (getMarketKey(get().exchange, get().symbol, get().interval) !== marketKey) {
        return;
      }

      if (!data.success) {
        set({
          isLoadingOlderKlines: false,
          olderKlineLoadError: data.error ?? DEFAULT_OLDER_KLINE_LOAD_ERROR,
        });
        return;
      }

      const olderKlines = normalizeKlines(data.klines ?? []);
      // 临时禁用验证以调试
      // const validOlderKlines = filterValidKlines(olderKlines);
      const validOlderKlines = olderKlines;
      const nextKlines = normalizeKlines([...validOlderKlines, ...get().klines]);
      const cacheKey = getMarketKey(get().exchange, get().symbol, get().interval);

      set({
        klines: nextKlines,
        klineSource: resolveKlineSource(data.source, nextKlines),
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: data.hasMore ?? false,
      });

      // 更新缓存
      const cached = klineCache.get(cacheKey);
      if (cached) {
        klineCache.set(cacheKey, {
          ...cached,
          klines: nextKlines,
          hasMoreHistoricalKlines: data.hasMore ?? false,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to load older klines:', error);
      set({
        isLoadingOlderKlines: false,
        olderKlineLoadError: DEFAULT_OLDER_KLINE_LOAD_ERROR,
      });
    }
  },

  retryLoadOlderKlines: async () => {
    await get().loadOlderKlines();
  },

  fetchSymbols: async () => {
    const { exchange, symbol, interval } = get();
    set({ isLoadingSymbols: true });

    try {
      const response = await fetch(
        `/quant/api/symbols?exchange=${exchange}&type=spot`,
      );
      const data = await readJsonResponse<BackendSymbolsResponse>(response);

      const nextSymbols = data.success
        ? normalizeSymbols(data.symbols, exchange)
        : [];

      const resolvedSymbol = applySymbolOptions(set, symbol, nextSymbols);
      writePersistedMarketSelection({ exchange, symbol: resolvedSymbol, interval });

      // 如果 symbol 发生变化，加载新 symbol 的 K 线
      if (resolvedSymbol !== symbol) {
        void get().loadInitialKlines();
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
      const resolvedSymbol = applySymbolOptions(set, symbol, []);
      writePersistedMarketSelection({ exchange, symbol: resolvedSymbol, interval });

      // 如果 symbol 发生变化，加载新 symbol 的 K 线
      if (resolvedSymbol !== symbol) {
        void get().loadInitialKlines();
      }
    }
  },

  fetchIndicatorSettings: async () => {
    const { isLoadingIndicatorSettings, indicatorPreferencesUnavailable } = get();

    if (indicatorPreferencesUnavailable) {
      set({
        indicatorSettings: { ...DEFAULT_INDICATOR_SETTINGS },
        isLoadingIndicatorSettings: false,
      });
      return;
    }

    if (isLoadingIndicatorSettings) {
      return;
    }

    set({ isLoadingIndicatorSettings: true });

    try {
      const response = await fetch('/quant/api/preferences/chart-indicators');
      const data = await readJsonResponse<BackendIndicatorSettingsResponse>(response);

      if (!data.success) {
        const shouldDisableRoute = isIndicatorPreferencesUnavailableError(data.error);
        set({
          indicatorSettings: { ...DEFAULT_INDICATOR_SETTINGS },
          isLoadingIndicatorSettings: false,
          indicatorPreferencesUnavailable: shouldDisableRoute,
        });
        return;
      }

      set({
        indicatorSettings: normalizeIndicatorSettings(data.settings),
        isLoadingIndicatorSettings: false,
        indicatorPreferencesUnavailable: false,
      });
    } catch (error) {
      console.error('Failed to load chart indicator settings:', error);
      set({
        indicatorSettings: { ...DEFAULT_INDICATOR_SETTINGS },
        isLoadingIndicatorSettings: false,
        indicatorPreferencesUnavailable: true,
      });
    }
  },

  updateIndicatorSetting: async (indicatorId, enabled) => {
    const { indicatorPreferencesUnavailable } = get();
    const nextSettings = {
      ...get().indicatorSettings,
      [indicatorId]: enabled,
    };

    set({ indicatorSettings: nextSettings });

    if (indicatorPreferencesUnavailable) {
      return;
    }

    try {
      const response = await fetch('/quant/api/preferences/chart-indicators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const data = await readJsonResponse<BackendIndicatorSettingsResponse>(response);

      if (!data.success) {
        const shouldDisableRoute = isIndicatorPreferencesUnavailableError(data.error);
        set({
          indicatorSettings: nextSettings,
          indicatorPreferencesUnavailable: shouldDisableRoute,
        });
        return;
      }

      set({
        indicatorSettings: normalizeIndicatorSettings(data.settings ?? nextSettings),
        indicatorPreferencesUnavailable: false,
      });
    } catch (error) {
      console.error('Failed to save chart indicator settings:', error);
      set({
        indicatorSettings: nextSettings,
        indicatorPreferencesUnavailable: true,
      });
    }
  },
}));

function readPersistedMarketSelection() {
  if (typeof sessionStorage === 'undefined') {
    return DEFAULT_MARKET_SELECTION;
  }

  try {
    const raw = sessionStorage.getItem(MARKET_SELECTION_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_MARKET_SELECTION;
    }

    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_MARKET_SELECTION>;

    if (
      typeof parsed.exchange !== 'string' ||
      typeof parsed.symbol !== 'string' ||
      typeof parsed.interval !== 'string'
    ) {
      return DEFAULT_MARKET_SELECTION;
    }

    return {
      exchange: parsed.exchange,
      symbol: parsed.symbol,
      interval: parsed.interval,
    };
  } catch (error) {
    console.error('Failed to parse persisted market selection:', error);
    return DEFAULT_MARKET_SELECTION;
  }
}

function writePersistedMarketSelection(selection: {
  exchange: string;
  symbol: string;
  interval: string;
}) {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  sessionStorage.setItem(
    MARKET_SELECTION_STORAGE_KEY,
    JSON.stringify(selection),
  );
}

function normalizeSymbols(
  symbols: BackendSymbol[] | undefined,
  exchange: string,
): SymbolOption[] {
  if (!Array.isArray(symbols)) {
    return [];
  }

  return symbols
    .filter((item) => !item.exchange || item.exchange === exchange)
    .filter((item) => item.type === undefined || item.type === 'spot')
    .map((item) => ({
      value: item.symbol,
      label: item.base_asset && item.quote_asset
        ? `${item.base_asset}/${item.quote_asset}`
        : formatMarketSymbol(item.symbol),
      baseAsset: item.base_asset,
      quoteAsset: item.quote_asset,
    }));
}

function mergeRealtimeKline(existing: Kline, incoming: Kline): Kline {
  const merged: Kline = {
    ...incoming,
    open: existing.open,
    high: Math.max(existing.high, incoming.high),
    low: Math.min(existing.low, incoming.low),
    volume: Math.max(existing.volume, incoming.volume),
    quote_volume: Math.max(existing.quote_volume, incoming.quote_volume),
  };

  if (typeof existing.trades_count === 'number' || typeof incoming.trades_count === 'number') {
    merged.trades_count = Math.max(existing.trades_count ?? 0, incoming.trades_count ?? 0);
  }

  return merged;
}

function normalizeKlines(klines: Kline[]): Kline[] {
  const deduped = new Map<number, Kline>();

  [...klines]
    .sort((left, right) => left.open_time - right.open_time)
    .forEach((kline) => {
      deduped.set(kline.open_time, kline);
    });

  return [...deduped.values()];
}

function applySymbolOptions(
  set: (partial: Partial<MarketState>) => void,
  currentSymbol: string,
  nextSymbols: SymbolOption[],
): string {
  const resolvedSymbols = nextSymbols.length > 0 ? nextSymbols : DEFAULT_SYMBOLS;
  const hasCurrentSymbol = resolvedSymbols.some((item) => item.value === currentSymbol);
  const resolvedSymbol = hasCurrentSymbol ? currentSymbol : resolvedSymbols[0].value;

  if (resolvedSymbol === currentSymbol) {
    set({
      symbols: resolvedSymbols,
      symbol: resolvedSymbol,
      isLoadingSymbols: false,
    });
    return resolvedSymbol;
  }

  set({
    symbols: resolvedSymbols,
    symbol: resolvedSymbol,
    isLoadingSymbols: false,
    klines: [],
    klineSource: 'empty',
    olderKlineLoadError: null,
    latestPrice: null,
    lastPriceTimestamp: null,
    klineLoadState: 'loading',
    isLoadingKlines: true,
  });

  return resolvedSymbol;
}

function resolveKlineSource(
  source: BackendKlineResponse['source'],
  klines: Kline[],
): KlineSource {
  if (source) {
    return source;
  }

  return klines.length > 0 ? 'remote' : 'empty';
}

async function fetchKlinePage(params: {
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
  before?: number;
}): Promise<BackendKlineResponse> {
  const { exchange, symbol, interval, limit, before } = params;
  const beforeQuery = typeof before === 'number' ? `&before=${before}` : '';
  const response = await fetch(
    `/quant/api/klines?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=${limit}${beforeQuery}`,
    {
      cache: 'no-store',
    },
  );

  return readJsonResponse<BackendKlineResponse>(response);
}

function isStaleInitialRequest(
  fetchToken: number,
  marketKey: string,
  get: () => MarketState,
): boolean {
  if (fetchToken !== latestFetchToken) {
    return true;
  }

  const currentState = get();
  const currentMarketKey = getMarketKey(
    currentState.exchange,
    currentState.symbol,
    currentState.interval,
  );

  return currentMarketKey !== marketKey;
}

function normalizeIndicatorSettings(
  settings: Partial<Record<IndicatorId, boolean>> | undefined,
): IndicatorSettings {
  return {
    volume: settings?.volume === true,
    ma5: settings?.ma5 === true,
    ma10: settings?.ma10 === true,
    ma20: settings?.ma20 === true,
  };
}

function isIndicatorPreferencesUnavailableError(error: string | undefined): boolean {
  if (!error) {
    return false;
  }

  if (error === INDICATOR_PREFERENCES_NOT_AVAILABLE) {
    return true;
  }

  const match = /^HTTP\s+(\d{3})$/.exec(error);

  if (!match) {
    return false;
  }

  const status = Number.parseInt(match[1], 10);
  return status >= 500;
}

async function readJsonResponse<T extends { success?: boolean; error?: string }>(
  response: Response,
): Promise<T> {
  const payload = await parseResponseBody<T>(response);
  const status = typeof response.status === 'number' ? response.status : 200;
  const isOk = response.ok !== false && status < 400;

  if (!isOk) {
    return {
      ...payload,
      success: false,
      error: payload.error ?? `HTTP ${status}`,
    };
  }

  return payload;
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  try {
    const textFn = (response as Response & { text?: () => Promise<string> }).text;

    if (typeof textFn === 'function') {
      const raw = await textFn.call(response);
      return raw ? JSON.parse(raw) as T : {} as T;
    }

    const jsonFn = (response as Response & { json?: () => Promise<T> }).json;

    if (typeof jsonFn === 'function') {
      return jsonFn.call(response);
    }
  } catch {
    return {} as T;
  }

  return {} as T;
}
