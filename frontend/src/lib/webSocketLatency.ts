/**
 * WebSocket 延迟监测工具
 */

export interface LatencyMonitor {
  /** 最新延迟值 (ms) */
  latency: number | null;
  /** 平均延迟值 (ms) */
  avgLatency: number | null;
  /** 延迟状态 */
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  /** 记录延迟值 */
  recordLatency: (latency: number) => void;
  /** 重置监测数据 */
  reset: () => void;
}

const LATENCY_HISTORY_SIZE = 10;

/**
 * 延迟状态阈值 (ms)
 * - excellent: < 50ms
 * - good: 50-150ms
 * - fair: 150-300ms
 * - poor: > 300ms
 */
const LATENCY_THRESHOLDS = {
  excellent: 50,
  good: 150,
  fair: 300,
} as const;

export function createLatencyMonitor(): LatencyMonitor {
  const history: number[] = [];

  return {
    latency: null,
    avgLatency: null,
    status: 'unknown',

    recordLatency(latency: number) {
      if (typeof latency !== 'number' || !Number.isFinite(latency) || latency < 0) {
        return;
      }

      history.push(latency);

      // 保持固定大小的历史记录
      if (history.length > LATENCY_HISTORY_SIZE) {
        history.shift();
      }

      // 更新状态
      const avg = history.reduce((sum, val) => sum + val, 0) / history.length;

      if (avg < LATENCY_THRESHOLDS.excellent) {
        this.status = 'excellent';
      } else if (avg < LATENCY_THRESHOLDS.good) {
        this.status = 'good';
      } else if (avg < LATENCY_THRESHOLDS.fair) {
        this.status = 'fair';
      } else {
        this.status = 'poor';
      }

      this.latency = latency;
      this.avgLatency = Math.round(avg);
    },

    reset() {
      history.length = 0;
      this.latency = null;
      this.avgLatency = null;
      this.status = 'unknown';
    },
  };
}

/**
 * 根据延迟状态获取颜色
 */
export function getLatencyColor(status: LatencyMonitor['status']): string {
  switch (status) {
    case 'excellent':
      return '#0ea765'; // 绿色
    case 'good':
      return '#10b981'; // 浅绿色
    case 'fair':
      return '#f59e0b'; // 黄色
    case 'poor':
      return '#ef4444'; // 红色
    default:
      return '#9ca3af'; // 灰色
  }
}

/**
 * 格式化延迟显示
 */
export function formatLatency(latency: number | null): string {
  if (typeof latency !== 'number') {
    return '--';
  }
  return `${Math.round(latency)}ms`;
}
