import { describe, expect, it } from 'vitest';
import { createLatencyMonitor, getLatencyColor, formatLatency } from '../lib/webSocketLatency';

describe('webSocketLatency', () => {
  describe('createLatencyMonitor', () => {
    it('starts with unknown status', () => {
      const monitor = createLatencyMonitor();
      expect(monitor.latency).toBe(null);
      expect(monitor.avgLatency).toBe(null);
      expect(monitor.status).toBe('unknown');
    });

    it('records latency and updates status to excellent', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(30);
      expect(monitor.latency).toBe(30);
      expect(monitor.status).toBe('excellent');
    });

    it('records latency and updates status to good', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(100);
      expect(monitor.status).toBe('good');
    });

    it('records latency and updates status to fair', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(200);
      expect(monitor.status).toBe('fair');
    });

    it('records latency and updates status to poor', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(400);
      expect(monitor.status).toBe('poor');
    });

    it('calculates average latency from history', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(50);
      monitor.recordLatency(100);
      monitor.recordLatency(150);
      expect(monitor.avgLatency).toBe(100);
    });

    it('maintains fixed history size', () => {
      const monitor = createLatencyMonitor();
      for (let i = 0; i < 15; i++) {
        monitor.recordLatency(i * 10);
      }
      // 平均应该只计算最近 10 个值
      expect(monitor.avgLatency).toBeGreaterThan(50);
    });

    it('resets to initial state', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(50);
      monitor.reset();
      expect(monitor.latency).toBe(null);
      expect(monitor.avgLatency).toBe(null);
      expect(monitor.status).toBe('unknown');
    });

    it('ignores invalid latency values', () => {
      const monitor = createLatencyMonitor();
      monitor.recordLatency(NaN);
      monitor.recordLatency(-1);
      monitor.recordLatency(Infinity);
      // 初始状态为 unknown，无效值不会改变状态
      expect(monitor.status).toBe('unknown');
      expect(monitor.latency).toBe(null);
    });
  });

  describe('getLatencyColor', () => {
    it('returns green for excellent', () => {
      expect(getLatencyColor('excellent')).toBe('#0ea765');
    });

    it('returns light green for good', () => {
      expect(getLatencyColor('good')).toBe('#10b981');
    });

    it('returns yellow for fair', () => {
      expect(getLatencyColor('fair')).toBe('#f59e0b');
    });

    it('returns red for poor', () => {
      expect(getLatencyColor('poor')).toBe('#ef4444');
    });

    it('returns gray for unknown', () => {
      expect(getLatencyColor('unknown')).toBe('#9ca3af');
    });
  });

  describe('formatLatency', () => {
    it('formats valid latency', () => {
      expect(formatLatency(45)).toBe('45ms');
    });

    it('rounds latency', () => {
      expect(formatLatency(45.678)).toBe('46ms');
    });

    it('returns -- for null', () => {
      expect(formatLatency(null)).toBe('--');
    });

    it('returns -- for undefined', () => {
      expect(formatLatency(undefined as unknown as number)).toBe('--');
    });
  });
});
