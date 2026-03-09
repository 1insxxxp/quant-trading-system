import cors from 'cors';
import express from 'express';
import { db } from './database/sqlite.js';
import { BinanceAdapter } from './exchanges/binance.js';
import { OKXAdapter } from './exchanges/okx.js';
import { klineService } from './services/kline.service.js';
import { WebSocketService } from './services/websocket.service.js';
import { runStartupSequence } from './startup/startup.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const WS_PORT = Number(process.env.WS_PORT ?? 4001);
const DEFAULT_INITIAL_KLINE_LIMIT = 2000;
const DEFAULT_HISTORY_PAGE_SIZE = 1000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now(),
  });
});

app.get('/api/klines', async (req, res) => {
  try {
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

async function initExchangeData() {
  console.log('Initializing exchange metadata and warm cache...');

  try {
    const binanceAdapter = new BinanceAdapter();
    const binanceSymbols = await binanceAdapter.getSymbols();
    binanceSymbols.forEach((symbol) => {
      db.saveSymbol(symbol);
    });
    console.log(`Binance symbols loaded: ${binanceSymbols.length}`);

    const okxAdapter = new OKXAdapter();
    const okxSymbols = await okxAdapter.getSymbols();
    okxSymbols.forEach((symbol) => {
      db.saveSymbol(symbol);
    });
    console.log(`OKX symbols loaded: ${okxSymbols.length}`);

    console.log('Preloading historical klines...');

    const symbolsToLoad = ['BTCUSDT', 'ETHUSDT'];
    const intervals = ['1h'];

    for (const symbol of symbolsToLoad) {
      for (const interval of intervals) {
        try {
          console.log(`  Preloading ${symbol} ${interval}...`);
          const klines = await binanceAdapter.getKlines(symbol, interval, 1000);

          if (klines.length > 0) {
            db.saveKlines(klines);
            console.log(`    Saved ${klines.length} klines`);
          }
        } catch (error: any) {
          console.error(`    Preload failed: ${error.message}`);
        }
      }
    }

    console.log('Exchange warmup complete');
  } catch (error: any) {
    console.error('Exchange initialization failed:', error.message);
    throw error;
  }
}

function startServer() {
  runStartupSequence({
    startHttp: () => {
      app.listen(PORT, () => {
        console.log(`Backend server started`);
        console.log(`  HTTP: http://localhost:${PORT}`);
        console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
        console.log(`  Health: http://localhost:${PORT}/api/health`);
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

try {
  startServer();
} catch (error) {
  console.error('Startup failed:', error);
  process.exit(1);
}
