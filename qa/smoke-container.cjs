const { execFileSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');

const image = process.argv[2];
if (!image || image.startsWith('-')) throw new Error('Pass a locally built POS image.');

const name = `pos-smoke-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000 }).trim();

async function main() {
  docker('run', '--detach', '--name', name, '--pull', 'never', '--publish', '127.0.0.1::8080',
    '-e', 'CORS_ORIGIN=http://localhost:8080',
    '-e', 'PASSWORD_RESET_BASE_URL=http://localhost:8080/reset-password',
    '-e', `JWT_ACCESS_SECRET=${randomBytes(32).toString('hex')}`,
    '-e', `JWT_REFRESH_SECRET=${randomBytes(32).toString('hex')}`,
    '-e', `PLATFORM_DEVELOPER_SETUP_TOKEN=${randomBytes(32).toString('hex')}`,
    image);

  try {
    const endpoint = docker('port', name, '8080/tcp');
    if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Unexpected exposure for test container.');
    const baseURL = `http://${endpoint}`;
    const deadline = Date.now() + 300_000;
    let healthy = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(2000) });
        healthy = response.ok;
        await response.body?.cancel();
        if (healthy) break;
      } catch {
        // nginx and the API start after the bundled database is ready.
      }
      await sleep(1000);
    }
    if (!healthy) throw new Error('Packaged POS failed its startup health check.');

    execFileSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config=qa/runtime.config.cjs'], {
      env: { ...process.env, SMOKE_BASE_URL: baseURL }, stdio: 'inherit', timeout: 120_000,
    });
  } catch (error) {
    console.error(docker('logs', '--tail', '80', name));
    throw error;
  } finally {
    docker('rm', '--force', '--volumes', name);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
