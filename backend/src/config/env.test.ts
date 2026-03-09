import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile, parseEnvContent } from './env.js';

const tempFiles: string[] = [];

describe('env loader', () => {
  afterEach(() => {
    while (tempFiles.length > 0) {
      const file = tempFiles.pop();

      if (file) {
        fs.rmSync(file, { force: true });
      }
    }
  });

  it('parses .env content and ignores blank lines or comments', () => {
    expect(parseEnvContent(`
# comment
PORT=4000

HTTP_PROXY=http://127.0.0.1:7897
INVALID_LINE
`)).toEqual({
      PORT: '4000',
      HTTP_PROXY: 'http://127.0.0.1:7897',
    });
  });

  it('loads missing env values from a file without overriding explicit values', () => {
    const filePath = path.join(os.tmpdir(), `quant-env-${Date.now()}.env`);
    tempFiles.push(filePath);
    fs.writeFileSync(filePath, 'PORT=4000\nHTTP_PROXY=http://127.0.0.1:7897\n');

    const env = {
      PORT: '5000',
      HTTPS_PROXY: 'http://127.0.0.1:8899',
    } as Record<string, string | undefined>;

    loadEnvFile(filePath, env);

    expect(env.PORT).toBe('5000');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7897');
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:8899');
  });
});
