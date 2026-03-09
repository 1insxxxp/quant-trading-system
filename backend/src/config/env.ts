import fs from 'node:fs';

export function parseEnvContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    parsed[key] = value;
  }

  return parsed;
}

export function loadEnvFile(
  filePath: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));

  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}
