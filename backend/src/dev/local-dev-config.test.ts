import { describe, expect, it } from 'vitest';
import {
  buildLocalDevConfig,
  parseLocalDevArgs,
} from './local-dev-config.js';

describe('parseLocalDevArgs', () => {
  it('enables frontend mode when --frontend is present', () => {
    expect(parseLocalDevArgs(['--frontend'])).toEqual({
      startFrontend: true,
      tunnelOnly: false,
    });
  });

  it('supports tunnel-only mode', () => {
    expect(parseLocalDevArgs(['--tunnel-only'])).toEqual({
      startFrontend: false,
      tunnelOnly: true,
    });
  });
});

describe('buildLocalDevConfig', () => {
  it('uses backend ports and cloud tunnel defaults', () => {
    const config = buildLocalDevConfig(
      {
        CLOUD_DB_SSH_PASSWORD: 'secret',
        DB_PASSWORD: 'quant_pass_2026',
      },
      parseLocalDevArgs([]),
    );

    expect(config).toEqual({
      startFrontend: false,
      tunnelOnly: false,
      services: {
        backendPort: 4000,
        wsPort: 4001,
      },
      tunnel: {
        localPort: 15432,
        remoteHost: '127.0.0.1',
        remotePort: 5432,
        sshHost: '43.134.235.139',
        sshPort: 22,
        sshUser: 'root',
        auth: {
          type: 'password',
          password: 'secret',
        },
      },
    });
  });

  it('accepts SSH private key auth from file path', () => {
    const config = buildLocalDevConfig(
      {
        CLOUD_DB_SSH_PRIVATE_KEY_PATH: 'C:\\Users\\Administrator\\.ssh\\id_ed25519',
      },
      parseLocalDevArgs(['--frontend']),
    );

    expect(config.startFrontend).toBe(true);
    expect(config.tunnel.auth).toEqual({
      type: 'privateKey',
      privateKeyPath: 'C:\\Users\\Administrator\\.ssh\\id_ed25519',
    });
  });

  it('rejects missing SSH auth configuration', () => {
    expect(() =>
      buildLocalDevConfig({}, parseLocalDevArgs([])),
    ).toThrow('Missing SSH auth');
  });
});
