import express from 'express';
import cors from 'cors';
import { WebSocketService } from './services/websocket.service.js';
import { klineService } from './services/kline.service.js';
import { db } from './database/sqlite.js';
import { BinanceAdapter } from './exchanges/binance.js';
import { OKXAdapter } from './exchanges/okx.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const WS_PORT = Number(process.env.WS_PORT ?? 3001);

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now(),
  });
});

// 获取 K 线数据
app.get('/api/klines', async (req, res) => {
  try {
    const { exchange, symbol, interval, limit } = req.query;

    if (!exchange || !symbol || !interval) {
      res.status(400).json({
        success: false,
        error: '缺少参数：需要 exchange, symbol, interval',
      });
      return;
    }

    const klines = await klineService.getKlines(
      exchange as string,
      symbol as string,
      interval as string,
      parseInt(limit as string) || 1000
    );

    res.json({
      success: true,
      klines,
      count: klines.length,
    });
  } catch (error: any) {
    console.error('获取 K 线失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取支持的交易所
app.get('/api/exchanges', (_req, res) => {
  res.json({
    success: true,
    exchanges: klineService.getExchanges(),
  });
});

// 获取交易对列表
app.get('/api/symbols', async (req, res) => {
  try {
    const { exchange, type } = req.query;
    const symbols = await klineService.getSymbols(
      exchange as string,
      type as string
    );

    res.json({
      success: true,
      symbols,
      count: symbols.length,
    });
  } catch (error: any) {
    console.error('获取交易对失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 初始化交易所数据（启动时）
async function initExchangeData() {
  console.log('🔄 初始化交易所数据...');

  try {
    // Binance 现货
    const binanceAdapter = new BinanceAdapter();
    const binanceSymbols = await binanceAdapter.getSymbols();
    binanceSymbols.forEach((s) => {
      db.saveSymbol(s);
    });
    console.log(`✅ Binance 交易对：${binanceSymbols.length} 个`);

    // OKX 现货
    const okxAdapter = new OKXAdapter();
    const okxSymbols = await okxAdapter.getSymbols();
    okxSymbols.forEach((s) => {
      db.saveSymbol(s);
    });
    console.log(`✅ OKX 交易对：${okxSymbols.length} 个`);

    // 预加载 BTCUSDT 和 ETHUSDT 的历史 K 线数据（1 小时周期，最近 1000 根）
    console.log('📊 预加载历史 K 线数据...');
    
    const symbolsToLoad = ['BTCUSDT', 'ETHUSDT'];
    const intervals = ['1h']; // 先加载 1 小时周期
    
    for (const symbol of symbolsToLoad) {
      for (const interval of intervals) {
        try {
          console.log(`  加载 ${symbol} ${interval}...`);
          const klines = await binanceAdapter.getKlines(symbol, interval, 1000);
          if (klines.length > 0) {
            db.saveKlines(klines);
            console.log(`    ✅ 保存 ${klines.length} 根 K 线`);
          }
        } catch (error: any) {
          console.error(`    ⚠️ 加载失败：${error.message}`);
        }
      }
    }
    
    console.log('✅ K 线数据预加载完成');
  } catch (error: any) {
    console.error('初始化交易所数据失败:', error.message);
  }
}

// 启动服务器
async function startServer() {
  // 初始化交易所数据
  await initExchangeData();

  // 启动 HTTP 服务
  app.listen(PORT, () => {
    console.log(`🚀 量化交易后端服务已启动`);
    console.log(`   HTTP: http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`   API 文档：http://localhost:${PORT}/api/health`);
  });

  // 启动 WebSocket 服务
  new WebSocketService(WS_PORT);
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 正在关闭服务...');
  process.exit(0);
});

// 启动
startServer().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
