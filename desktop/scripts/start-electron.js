const { spawn } = require('child_process');
const path = require('path');

const desktopDir = path.join(__dirname, '..');
const electronBin = path.join(desktopDir, 'node_modules', 'electron', 'dist', 'electron');

const env = { ...process.env };
// Cursor/CI sometimes sets this and breaks Electron's main-process APIs.
delete env.ELECTRON_RUN_AS_NODE;
env.ELECTRON_DISABLE_SANDBOX = '1';

const child = spawn(
  electronBin,
  ['.', '--no-sandbox', '--disable-gpu-sandbox'],
  { cwd: desktopDir, env, stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
