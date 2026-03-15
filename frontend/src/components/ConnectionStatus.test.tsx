import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConnectionStatus } from './ConnectionStatus';

describe('ConnectionStatus', () => {
  it('renders connected state with latency', () => {
    const markup = renderToStaticMarkup(
      <ConnectionStatus
        state="connected"
        latency={45}
        latencyStatus="excellent"
      />,
    );

    expect(markup).toContain('connection-status');
    expect(markup).toContain('已连接');
    expect(markup).toContain('45ms');
    expect(markup).toContain('connection-status__indicator--excellent');
  });

  it('renders disconnected state', () => {
    const markup = renderToStaticMarkup(
      <ConnectionStatus
        state="disconnected"
        latency={null}
        latencyStatus="unknown"
      />,
    );

    expect(markup).toContain('未连接');
    expect(markup).toContain('connection-status__indicator--disconnected');
  });

  it('renders reconnecting state with count', () => {
    const markup = renderToStaticMarkup(
      <ConnectionStatus
        state="reconnecting"
        latency={null}
        latencyStatus="unknown"
        reconnectCount={3}
      />,
    );

    expect(markup).toContain('连接断开');
    expect(markup).toContain('重连中 (3)');
  });

  it('renders connecting state', () => {
    const markup = renderToStaticMarkup(
      <ConnectionStatus
        state="connecting"
        latency={null}
        latencyStatus="unknown"
      />,
    );

    expect(markup).toContain('正在连接');
  });

  it('renders poor latency with warning color', () => {
    const markup = renderToStaticMarkup(
      <ConnectionStatus
        state="connected"
        latency={350}
        latencyStatus="poor"
      />,
    );

    expect(markup).toContain('connection-status__indicator--poor');
  });
});
