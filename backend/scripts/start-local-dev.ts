import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { Client, type ConnectConfig } from 'ssh2';
import { Client as PgClient } from 'pg';
import '../src/config/load-env.ts';
import {
  buildLocalDevConfig,
  parseLocalDevArgs,
} from '../src/dev/local-dev-config.ts';
import {
  getTunnelHealthErrorMessage,
  resolveTunnelDecision,
} from '../src/dev/local-dev-tunnel.ts';

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const frontendDir = path.resolve(backendDir, '../frontend');
const config = buildLocalDevConfig(process.env, parseLocalDevArgs(process.argv.slice(2)));

type TunnelHandle = {
  close: () => Promise<void>;
};

type ManagedTunnelState = {
  activeConnection: Client | null;
  closed: boolean;
  reconnectTimer: NodeJS.Timeout | null;
};

function spawnNpmCommand(
  cwd: string,
  args: string[],
  name: string,
): ChildProcess {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (code !== null) {
      console.log(`[local-dev] ${name} exited with code ${code}`);
      return;
    }

    if (signal) {
      console.log(`[local-dev] ${name} exited with signal ${signal}`);
    }
  });

  return child;
}

function waitForPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function ensureTunnel(): Promise<TunnelHandle | null> {
  const alreadyOpen = await waitForPortOpen('127.0.0.1', config.tunnel.localPort, 1000);
  const databaseReachable = alreadyOpen
    ? await waitForDatabaseReady('127.0.0.1', config.tunnel.localPort, 1500)
    : false;
  const decision = resolveTunnelDecision({
    portOpen: alreadyOpen,
    databaseReachable,
  });

  if (decision === 'reuse') {
    console.log(
      `[local-dev] Reusing existing DB tunnel on 127.0.0.1:${config.tunnel.localPort}`,
    );
    return null;
  }

  if (decision === 'restart_required') {
    throw new Error(getTunnelHealthErrorMessage(config.tunnel.localPort));
  }

  const state: ManagedTunnelState = {
    activeConnection: null,
    closed: false,
    reconnectTimer: null,
  };
  const server = net.createServer((socket) => {
    const connection = state.activeConnection;

    if (!connection) {
      socket.destroy(new Error('DB tunnel is reconnecting'));
      return;
    }

    connection.forwardOut(
      socket.remoteAddress || '127.0.0.1',
      socket.remotePort || 0,
      config.tunnel.remoteHost,
      config.tunnel.remotePort,
      (error, stream) => {
        if (error) {
          socket.destroy(error);
          return;
        }

        socket.pipe(stream).pipe(socket);
        socket.on('error', () => stream.end());
        stream.on('error', () => socket.destroy());
      },
    );
  });

  let serverListening = false;

  const connectTunnel = async (isReconnect: boolean): Promise<void> => {
    const conn = new Client();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let reconnectScheduled = false;

      const scheduleReconnect = () => {
        if (reconnectScheduled || state.closed) {
          return;
        }

        reconnectScheduled = true;
        state.activeConnection = null;

        if (state.reconnectTimer) {
          clearTimeout(state.reconnectTimer);
        }

        state.reconnectTimer = setTimeout(() => {
          state.reconnectTimer = null;
          void connectTunnel(true).catch((error) => {
            console.error('[local-dev] DB tunnel reconnect failed');
            console.error(error);
          });
        }, 1000);
      };

      conn
        .once('ready', () => {
          state.activeConnection = conn;

          const onReady = async () => {
            const databaseReady = await waitForDatabaseReady(
              '127.0.0.1',
              config.tunnel.localPort,
              3000,
            );

            if (!databaseReady) {
              conn.end();
              const error = new Error(
                `DB tunnel opened on 127.0.0.1:${config.tunnel.localPort}, but PostgreSQL did not become ready.`,
              );

              if (!settled) {
                settled = true;
                reject(error);
              } else {
                console.error('[local-dev] DB tunnel lost PostgreSQL readiness after reconnect');
                console.error(error);
                scheduleReconnect();
              }

              return;
            }

            if (!isReconnect) {
              console.log(
                `[local-dev] DB tunnel ready on 127.0.0.1:${config.tunnel.localPort} -> ${config.tunnel.remoteHost}:${config.tunnel.remotePort} via ${config.tunnel.sshHost}:${config.tunnel.sshPort}`,
              );
            } else {
              console.log(
                `[local-dev] DB tunnel reconnected on 127.0.0.1:${config.tunnel.localPort}`,
              );
            }

            if (!settled) {
              settled = true;
              resolve();
            }
          };

          if (!serverListening) {
            server.listen(config.tunnel.localPort, '127.0.0.1', () => {
              serverListening = true;
              void onReady();
            });
            return;
          }

          void onReady();
        })
        .on('error', (error) => {
          if (!settled) {
            settled = true;
            reject(error);
            return;
          }

          console.error('[local-dev] DB tunnel SSH client error');
          console.error(error);
        })
        .on('close', () => {
          if (state.activeConnection === conn) {
            state.activeConnection = null;
          }

          if (!state.closed) {
            console.warn('[local-dev] DB tunnel disconnected, retrying...');
            scheduleReconnect();
          }
        })
        .connect(buildSshConfig());
    });
  };

  await connectTunnel(false);

  return {
    close: async () => {
      state.closed = true;

      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }

      await new Promise<void>((resolve) => server.close(() => resolve()));
      state.activeConnection?.end();
    },
  };
}

async function waitForDatabaseReady(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const client = new PgClient({
    host,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: timeoutMs,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function buildSshConfig(): ConnectConfig {
  const baseConfig: ConnectConfig = {
    host: config.tunnel.sshHost,
    port: config.tunnel.sshPort,
    username: config.tunnel.sshUser,
    readyTimeout: 20_000,
    keepaliveInterval: 10_000,
    keepaliveCountMax: 3,
  };

  if (config.tunnel.auth.type === 'password') {
    return {
      ...baseConfig,
      password: config.tunnel.auth.password,
    };
  }

  return {
    ...baseConfig,
    privateKey: fs.readFileSync(config.tunnel.auth.privateKeyPath, 'utf8'),
  };
}

async function main(): Promise<void> {
  console.log(
    `[local-dev] Backend http:${config.services.backendPort} ws:${config.services.wsPort}`,
  );

  const tunnel = await ensureTunnel();

  if (config.tunnelOnly) {
    console.log('[local-dev] Tunnel-only mode. Press Ctrl+C to stop.');
    attachExitHandlers([], tunnel);
    return;
  }

  const processes: ChildProcess[] = [];
  processes.push(spawnNpmCommand(backendDir, ['run', 'dev'], 'backend'));

  if (config.startFrontend) {
    processes.push(spawnNpmCommand(frontendDir, ['run', 'dev'], 'frontend'));
  }

  attachExitHandlers(processes, tunnel);
}

function attachExitHandlers(
  processes: ChildProcess[],
  tunnel: TunnelHandle | null,
): void {
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    for (const child of processes) {
      if (child.killed) {
        continue;
      }

      child.kill('SIGINT');
    }

    if (tunnel) {
      await tunnel.close();
    }

    process.exit(0);
  };

  for (const child of processes) {
    child.once('exit', async (code) => {
      if (code && code !== 0) {
        process.exitCode = code;
      }

      await shutdown();
    });
  }

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('[local-dev] Failed to start local dev stack');
  console.error(error);
  process.exit(1);
});
