import { describe, expect, it } from 'vitest';
import {
  getTunnelHealthErrorMessage,
  resolveTunnelDecision,
} from './local-dev-tunnel.js';

describe('resolveTunnelDecision', () => {
  it('starts a new tunnel when no local tunnel port is open', () => {
    expect(
      resolveTunnelDecision({
        portOpen: false,
        databaseReachable: false,
      }),
    ).toBe('start_new');
  });

  it('reuses an existing tunnel when PostgreSQL is reachable', () => {
    expect(
      resolveTunnelDecision({
        portOpen: true,
        databaseReachable: true,
      }),
    ).toBe('reuse');
  });

  it('rejects stale tunnels that only expose a dead local port', () => {
    expect(
      resolveTunnelDecision({
        portOpen: true,
        databaseReachable: false,
      }),
    ).toBe('restart_required');
  });
});

describe('getTunnelHealthErrorMessage', () => {
  it('returns an actionable error for unhealthy local tunnels', () => {
    expect(getTunnelHealthErrorMessage(15432)).toContain('15432');
    expect(getTunnelHealthErrorMessage(15432)).toContain('not healthy');
  });
});
