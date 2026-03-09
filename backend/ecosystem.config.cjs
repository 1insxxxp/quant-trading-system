const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

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
    env[key] = value;
  }

  return env;
}

const backendDir = __dirname;
const envFile = path.join(backendDir, '.env');
const fileEnv = parseEnvFile(envFile);

module.exports = {
  apps: [
    {
      name: 'quant-backend',
      cwd: backendDir,
      script: 'npm',
      args: 'run start',
      env: {
        ...process.env,
        ...fileEnv,
      },
    },
  ],
};
