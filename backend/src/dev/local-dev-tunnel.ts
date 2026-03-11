export type TunnelDecisionInput = {
  portOpen: boolean;
  databaseReachable: boolean;
};

export type TunnelDecision = 'start_new' | 'reuse' | 'restart_required';

export function resolveTunnelDecision({
  portOpen,
  databaseReachable,
}: TunnelDecisionInput): TunnelDecision {
  if (!portOpen) {
    return 'start_new';
  }

  return databaseReachable ? 'reuse' : 'restart_required';
}

export function getTunnelHealthErrorMessage(localPort: number): string {
  return `Existing DB tunnel on 127.0.0.1:${localPort} is not healthy. Stop the stale tunnel process and rerun local backend.`;
}
