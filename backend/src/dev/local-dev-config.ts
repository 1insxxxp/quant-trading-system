export type LocalDevArgs = {
  startFrontend: boolean;
  tunnelOnly: boolean;
};

export type TunnelAuth =
  | {
      type: 'password';
      password: string;
    }
  | {
      type: 'privateKey';
      privateKeyPath: string;
    };

export type LocalDevConfig = {
  startFrontend: boolean;
  tunnelOnly: boolean;
  services: {
    backendPort: number;
    wsPort: number;
  };
  tunnel: {
    localPort: number;
    remoteHost: string;
    remotePort: number;
    sshHost: string;
    sshPort: number;
    sshUser: string;
    auth: TunnelAuth;
  };
};

type LocalDevEnv = Record<string, string | undefined>;

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseLocalDevArgs(argv: string[]): LocalDevArgs {
  return {
    startFrontend: argv.includes('--frontend'),
    tunnelOnly: argv.includes('--tunnel-only'),
  };
}

export function buildLocalDevConfig(
  env: LocalDevEnv,
  args: LocalDevArgs,
): LocalDevConfig {
  const sshPassword = env.CLOUD_DB_SSH_PASSWORD?.trim();
  const privateKeyPath = env.CLOUD_DB_SSH_PRIVATE_KEY_PATH?.trim();

  if (!sshPassword && !privateKeyPath) {
    throw new Error(
      'Missing SSH auth. Set CLOUD_DB_SSH_PASSWORD or CLOUD_DB_SSH_PRIVATE_KEY_PATH.',
    );
  }

  return {
    startFrontend: args.startFrontend,
    tunnelOnly: args.tunnelOnly,
    services: {
      backendPort: parseInteger(env.PORT, 4000),
      wsPort: parseInteger(env.WS_PORT, 4001),
    },
    tunnel: {
      localPort: parseInteger(env.LOCAL_DB_TUNNEL_PORT ?? env.DB_PORT, 15432),
      remoteHost: env.CLOUD_DB_REMOTE_HOST?.trim() || '127.0.0.1',
      remotePort: parseInteger(env.CLOUD_DB_REMOTE_PORT, 5432),
      sshHost: env.CLOUD_DB_SSH_HOST?.trim() || '43.134.235.139',
      sshPort: parseInteger(env.CLOUD_DB_SSH_PORT, 22),
      sshUser: env.CLOUD_DB_SSH_USER?.trim() || 'root',
      auth: sshPassword
        ? {
            type: 'password',
            password: sshPassword,
          }
        : {
            type: 'privateKey',
            privateKeyPath: privateKeyPath!,
          },
    },
  };
}
