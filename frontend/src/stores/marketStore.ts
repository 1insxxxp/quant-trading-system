import { create } from 'zustand';
import { formatMarketSymbol } from '../lib/marketDisplay.js';
import type {
  IndicatorId,
  IndicatorSettings,
  Kline,
  KlineSource,
  MarketState,
  SymbolOption,
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
];

const DEFAULT_MARKET_SELECTION = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  interval: '1h',
} as const;
const INITIAL_KLINE_LIMIT = 500;
const OLDER_KLINE_PAGE_SIZE = 1000;
const INITIAL_TOP_UP_MAX_ROUNDS = 4;
const DEFAULT_OLDER_KLINE_LOAD_ERROR = '加载历史K线失败，请重试。';

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

  setExchange: (exchange: string) => {
    set((state) => {
      writePersistedMarketSelection({
        exchange,
        symbol: state.symbol,
        interval: state.interval,
      });

      return {
        exchange,
        latestPrice: null,
        lastPriceTimestamp: null,
        isLoadingKlines: true,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: true,
      };
    });
    void get().fetchSymbols();
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
        latestPrice: null,
        lastPriceTimestamp: null,
        isLoadingKlines: true,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: true,
      };
    });
    void get().loadInitialKlines();
  },

  setInterval: (interval: string) => {
    set((state) => {
      writePersistedMarketSelection({
        exchange: state.exchange,
        symbol: state.symbol,
        interval,
      });

      return {
        interval,
        latestPrice: null,
        lastPriceTimestamp: null,
        isLoadingKlines: true,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: true,
      };
    });
    void get().loadInitialKlines();
  },

  setKlines: (klines: Kline[]) => {
    const normalizedKlines = normalizeKlines(klines);
    set({
      klines: normalizedKlines,
      klineSource: normalizedKlines.length > 0 ? get().klineSource : 'empty',
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

      const nextKlines = normalizeKlines([...state.klines, ...relevantKlines]);

      return {
        klines: nextKlines,
        latestPrice: nextKlines[nextKlines.length - 1]?.close ?? state.latestPrice,
      };
    });
  },

  updateKline: (kline: Kline) => {
    const { klines, exchange, symbol, interval } = get();

    if (
      kline.exchange !== exchange ||
      kline.symbol !== symbol ||
      kline.interval !== interval
    ) {
      return;
    }

    const index = klines.findIndex((item) => item.open_time === kline.open_time);

    if (index >= 0) {
      const nextKlines = [...klines];
      nextKlines[index] = kline;
      nextKlines.sort((a, b) => a.open_time - b.open_time);
      set({
        klines: nextKlines,
        latestPrice: nextKlines[nextKlines.length - 1]?.close ?? null,
      });
      return;
    }

    const nextKlines = [...klines, kline].sort((a, b) => a.open_time - b.open_time);
    set({
      klines: nextKlines,
      latestPrice: nextKlines[nextKlines.length - 1]?.close ?? null,
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

  loadInitialKlines: async () => {
    const { exchange, symbol, interval } = get();
    const marketKey = getMarketKey(exchange, symbol, interval);
    const fetchToken = ++latestFetchToken;

    set({
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

      let mergedKlines = normalizeKlines(initialResult.klines ?? []);
      let hasMoreHistory = initialResult.hasMore ?? false;
      let source = resolveKlineSource(initialResult.source, mergedKlines);
      let beforeCursor = mergedKlines[0]?.open_time;

      for (
        let round = 0;
        round < INITIAL_TOP_UP_MAX_ROUNDS &&
        mergedKlines.length < INITIAL_KLINE_LIMIT &&
        hasMoreHistory &&
        typeof beforeCursor === 'number';
        round += 1
      ) {
        const page = await fetchKlinePage({
          exchange,
          symbol,
          interval,
          limit: Math.min(OLDER_KLINE_PAGE_SIZE, INITIAL_KLINE_LIMIT - mergedKlines.length),
          before: beforeCursor,
        });

        if (isStaleInitialRequest(fetchToken, marketKey, get)) {
          return;
        }

        if (!page.success) {
          break;
        }

        const older = normalizeKlines(page.klines ?? []);

        if (older.length === 0) {
          hasMoreHistory = false;
          break;
        }

        mergedKlines = normalizeKlines([...older, ...mergedKlines]);
        hasMoreHistory = page.hasMore ?? false;
        beforeCursor = mergedKlines[0]?.open_time;

        if (source !== 'remote') {
          source = resolveKlineSource(page.source, mergedKlines);
        }
      }

      const nextKlines = mergedKlines.slice(-INITIAL_KLINE_LIMIT);
      set({
        klines: nextKlines,
        klineSource: source,
        latestPrice: nextKlines[nextKlines.length - 1]?.close ?? null,
        lastPriceTimestamp: null,
        isLoadingKlines: false,
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: hasMoreHistory || mergedKlines.length > INITIAL_KLINE_LIMIT,
      });
    } catch (error) {
      if (isStaleInitialRequest(fetchToken, marketKey, get)) {
        return;
      }

      console.error('Failed to load klines:', error);
      set({
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
      const nextKlines = normalizeKlines([...olderKlines, ...get().klines]);

      set({
        klines: nextKlines,
        klineSource: resolveKlineSource(data.source, nextKlines),
        isLoadingOlderKlines: false,
        olderKlineLoadError: null,
        hasMoreHistoricalKlines: data.hasMore ?? false,
      });
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
    } catch (error) {
      console.error('Failed to load symbols:', error);
      const resolvedSymbol = applySymbolOptions(set, symbol, []);
      writePersistedMarketSelection({ exchange, symbol: resolvedSymbol, interval });
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
    .filter((item) => ['BTC', 'ETH'].includes(item.base_asset ?? ''))
    .map((item) => ({
      value: item.symbol,
      label: item.base_asset && item.quote_asset
        ? `${item.base_asset}/${item.quote_asset}`
        : formatMarketSymbol(item.symbol),
      baseAsset: item.base_asset,
      quoteAsset: item.quote_asset,
    }));
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

  set({
    symbols: resolvedSymbols,
    symbol: resolvedSymbol,
    isLoadingSymbols: false,
    olderKlineLoadError: null,
    ...(resolvedSymbol !== currentSymbol
      ? { latestPrice: null, lastPriceTimestamp: null, isLoadingKlines: true }
      : {}),
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
