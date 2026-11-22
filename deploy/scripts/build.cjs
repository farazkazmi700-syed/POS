const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const directory of ['app/api', 'app/pdf-worker', 'app/web']) {
  console.log(`Building ${directory}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: path.resolve(__dirname, '../..', directory), stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
