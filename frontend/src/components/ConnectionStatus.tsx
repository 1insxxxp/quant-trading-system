import React from 'react';
import { getLatencyColor, formatLatency, type LatencyMonitor } from '../lib/webSocketLatency';

interface ConnectionStatusProps {
  state: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  latency: number | null;
  latencyStatus: LatencyMonitor['status'];
  reconnectCount?: number;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  state,
  latency,
  latencyStatus,
  reconnectCount = 0,
}) => {
  const statusConfig = getStatusConfig(state, latencyStatus, latency);

  return (
    <div className="connection-status" title={statusConfig.tooltip}>
      <span
        className={`connection-status__indicator connection-status__indicator--${statusConfig.statusClass}`}
        aria-hidden="true"
      />
      <span className="connection-status__label">
        {statusConfig.label}
        {latency !== null && state === 'connected' && (
          <span
            className="connection-status__latency"
            style={{ color: getLatencyColor(latencyStatus) }}
          >
            {formatLatency(latency)}
          </span>
        )}
      </span>
      {reconnectCount > 0 && state === 'reconnecting' && (
        <span className="connection-status__reconnect">
          重连中 ({reconnectCount})
        </span>
      )}
    </div>
  );
};

function getStatusConfig(
  state: ConnectionStatusProps['state'],
  latencyStatus: LatencyMonitor['status'],
  latency?: number | null,
) {
  switch (state) {
    case 'connected':
      return {
        statusClass: latencyStatus === 'poor' ? 'poor' : latencyStatus,
        label: '已连接',
        tooltip: `WebSocket 已连接，延迟：${formatLatency(latency ?? null)}`,
      };
    case 'connecting':
      return {
        statusClass: 'waiting',
        label: '正在连接...',
        tooltip: '正在建立 WebSocket 连接',
      };
    case 'reconnecting':
      return {
        statusClass: 'reconnecting',
        label: '连接断开',
        tooltip: 'WebSocket 连接断开，正在尝试重连',
      };
    case 'disconnected':
    default:
      return {
        statusClass: 'disconnected',
        label: '未连接',
        tooltip: 'WebSocket 未连接',
      };
  }
}
