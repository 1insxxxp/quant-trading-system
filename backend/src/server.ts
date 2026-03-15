import './config/load-env.js';
import cors from 'cors';
import express from 'express';
import { redisCache } from './cache/redis.js';
import { db } from './database/postgres.js';
import { BinanceAdapter } from './exchanges/binance.js';
import { OKXAdapter } from './exchanges/okx.js';
import { klineService } from './services/kline.service.js';
import { syncStateService } from './services/sync-state.service.js';
import { WebSocketService } from './services/websocket.service.js';
import { runStartupSequence } from './startup/startup.js';
import type { ChartIndicatorSettings } from './types/index.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const WS_PORT = Number(process.env.WS_PORT ?? 4001);
const DEFAULT_INITIAL_KLINE_LIMIT = 2000;
const DEFAULT_HISTORY_PAGE_SIZE = 1000;
const APP_VERSION = process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev';
const USE_MOCK_FUNDING_RATE = process.env.USE_MOCK_FUNDING_RATE === 'true';
const DEFAULT_INDICATOR_SETTINGS: ChartIndicatorSettings = {
  volume: false,
  ma5: false,
  ma10: false,
  ma20: false,
};

let volatileIndicatorSettings: ChartIndicatorSettings = { ...DEFAULT_INDICATOR_SETTINGS };

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now(),
  });
});

app.get('/version', (_req, res) => {
  res.json({
    success: true,
    version: APP_VERSION,
    timestamp: Date.now(),
  });
});

app.get('/api/version', (_req, res) => {
  res.json({
    success: true,
    version: APP_VERSION,
    timestamp: Date.now(),
  });
});

app.get('/api/klines', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    });

    const { exchange, symbol, interval, limit, before } = req.query;

    if (!exchange || !symbol || !interval) {
      res.status(400).json({
        success: false,
        error: 'Missing required query params: exchange, symbol, interval',
      });
      return;
    }

    const parsedLimit = Math.max(
      1,
      parseInt(limit as string) || (before ? DEFAULT_HISTORY_PAGE_SIZE : DEFAULT_INITIAL_KLINE_LIMIT),
    );

    const result = await klineService.getKlines(
      exchange as string,
      symbol as string,
      interval as string,
      parsedLimit,
      before ? parseInt(before as string) : undefined,
    );

    res.json({
      success: true,
      klines: result.klines,
      source: result.source,
      hasMore: result.hasMore,
      count: result.klines.length,
    });
  } catch (error: any) {
    console.error('Failed to load klines:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/exchanges', (_req, res) => {
  res.json({
    success: true,
    exchanges: klineService.getExchanges(),
  });
});

app.get('/api/symbols', async (req, res) => {
  try {
    const { exchange, type } = req.query;
    const symbols = await klineService.getSymbols(
      exchange as string,
      type as string,
    );

    res.json({
      success: true,
      symbols,
      count: symbols.length,
    });
  } catch (error: any) {
    console.error('Failed to load symbols:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/funding-rate', async (req, res) => {
  try {
    const { exchange, symbol } = req.query;

    if (!exchange || !symbol) {
      res.status(400).json({
        success: false,
        error: 'Missing required query params: exchange, symbol',
      });
      return;
    }

    // Return mock data in development if enabled
    if (USE_MOCK_FUNDING_RATE) {
      res.json({
        success: true,
        fundingRate: {
          exchange: 'binance',
          symbol: symbol as string,
          fundingRate: 0.0001 + Math.random() * 0.0002,
          fundingTimestamp: Date.now(),
          nextFundingTimestamp: Date.now() + 8 * 60 * 60 * 1000,
          markPrice: 2000 + Math.random() * 100,
          indexPrice: 2000 + Math.random() * 100,
        },
      });
      return;
    }

    let fundingRate: any;
    if (exchange === 'binance') {
      const binance = new BinanceAdapter();
      fundingRate = await binance.getFundingRate(symbol as string);
    } else {
      res.status(400).json({
        success: false,
        error: `Unsupported exchange: ${exchange}`,
      });
      return;
    }

    res.json({
      success: true,
      fundingRate,
    });
  } catch (error: any) {
    console.error('Failed to load funding rate:', error.message);
    res.status(200).json({
      success: false,
      error: error.message,
      fundingRate: null,
    });
  }
});

app.get('/api/preferences/chart-indicators', async (_req, res) => {
  try {
    const settings = await db.getChartIndicatorSettings();
    volatileIndicatorSettings = normalizeIndicatorSettings(settings);

    res.json({
      success: true,
      settings: volatileIndicatorSettings,
      storage: 'database',
    });
  } catch (error: any) {
    console.warn('Chart indicator settings fallback to volatile storage:', error.message);
    res.json({
      success: true,
      settings: volatileIndicatorSettings,
      storage: 'volatile',
    });
  }
});

app.put('/api/preferences/chart-indicators', async (req, res) => {
  const nextSettings = normalizeIndicatorSettings(req.body?.settings ?? {});

  try {
    const settings = await db.saveChartIndicatorSettings(nextSettings);
    volatileIndicatorSettings = normalizeIndicatorSettings(settings);

    res.json({
      success: true,
      settings: volatileIndicatorSettings,
      storage: 'database',
    });
  } catch (error: any) {
    console.warn('Chart indicator settings persist failed, switching to volatile storage:', error.message);
    volatileIndicatorSettings = nextSettings;
    res.json({
      success: true,
      settings: volatileIndicatorSettings,
      storage: 'volatile',
    });
  }
});

async function initExchangeData() {
  console.log('Initializing exchange metadata and warm cache...');

  try {
    await Promise.all([db.ready(), redisCache.connect()]);

    const binanceAdapter = new BinanceAdapter();
    try {
      const binanceSymbols = await binanceAdapter.getSymbols();
      await Promise.all(binanceSymbols.map((symbol) => db.saveSymbol(symbol)));
      await syncStateService.recordSymbolSyncSuccess('binance', 'spot', binanceSymbols.length);
      console.log(`Binance symbols loaded: ${binanceSymbols.length}`);
    } catch (error: any) {
      await syncStateService.recordSymbolSyncError('binance', 'spot', error);
      throw error;
    }

    const okxAdapter = new OKXAdapter();
    try {
      const okxSymbols = await okxAdapter.getSymbols();
      await Promise.all(okxSymbols.map((symbol) => db.saveSymbol(symbol)));
      await syncStateService.recordSymbolSyncSuccess('okx', 'spot', okxSymbols.length);
      console.log(`OKX symbols loaded: ${okxSymbols.length}`);
    } catch (error: any) {
      await syncStateService.recordSymbolSyncError('okx', 'spot', error);
      throw error;
    }

    console.log('Preloading historical klines...');

    const symbolsToLoad = ['BTCUSDT', 'ETHUSDT'];
    const intervals = ['5m', '1h', '4h'];

    await Promise.all(
      symbolsToLoad.flatMap((symbol) =>
        intervals.map(async (interval) => {
          try {
            console.log(`  Preloading ${symbol} ${interval}...`);
            const klines = await binanceAdapter.getKlines(symbol, interval, 1000);

            if (klines.length > 0) {
              await db.saveKlines(klines);
              void redisCache.setKlines('binance', symbol, interval, klines).catch(() => {});
              console.log(`    Saved ${klines.length} klines for ${symbol} ${interval}`);
            }
          } catch (error: any) {
            console.error(`    Preload failed for ${symbol} ${interval}: ${error.message}`);
          }
        }),
      ),
    );

    console.log('Exchange warmup complete');
  } catch (error: any) {
    console.error('Exchange initialization failed:', error.message);
    throw error;
  }
}

function startServer() {
  runStartupSequence({
    startHttp: () => {
      const server = app.listen(PORT, () => {
        console.log(`Backend server started`);
        console.log(`  HTTP: http://localhost:${PORT}`);
        console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
        console.log(`  Health: http://localhost:${PORT}/api/health`);
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ 端口 ${PORT} 已被占用，请检查是否有其他实例正在运行`);
          console.error(`   提示：可以使用以下命令查找占用端口的进程：`);
          console.error(`   Windows: netstat -ano | findstr :${PORT}`);
          console.error(`   Linux/Mac: lsof -i :${PORT}`);
          process.exit(1);
        } else {
          console.error('HTTP 服务器启动失败:', error);
          process.exit(1);
        }
      });
    },
    startWebSocket: () => {
      new WebSocketService(WS_PORT);
    },
    warmup: initExchangeData,
    onWarmupError: (error) => {
      console.error('Background exchange warmup failed:', error);
    },
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

try {
  startServer();
} catch (error) {
  console.error('Startup failed:', error);
  process.exit(1);
}

function normalizeIndicatorSettings(raw: unknown): ChartIndicatorSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_INDICATOR_SETTINGS };
  }

  const source = raw as Partial<Record<keyof ChartIndicatorSettings, unknown>>;
  return {
    volume: source.volume === true,
    ma5: source.ma5 === true,
    ma10: source.ma10 === true,
    ma20: source.ma20 === true,
  };
}
