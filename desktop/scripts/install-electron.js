#!/usr/bin/env node
/**
 * Ensures Electron binary is downloaded (fixes incomplete npm postinstall).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const binaryPath = path.join(distDir, 'electron');
const pathFile = path.join(electronDir, 'path.txt');

function isReady() {
  return fs.existsSync(binaryPath) && fs.existsSync(pathFile);
}

async function main() {
  if (isReady()) {
    console.log('Electron binary already installed.');
    return;
  }

  console.log('Installing Electron binary...');

  // Run official electron postinstall
  try {
    execSync('node install.js', { cwd: electronDir, stdio: 'inherit' });
  } catch {
    // fall through to manual unzip
  }

  if (isReady()) {
    console.log('Electron ready.');
    return;
  }

  // Fallback: download via @electron/get + system unzip
  const { downloadArtifact } = require('@electron/get');
  const version = require(path.join(electronDir, 'package.json')).version;
  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  });

  fs.mkdirSync(distDir, { recursive: true });
  execSync(`unzip -oq "${zip}" -d "${distDir}"`, { stdio: 'inherit' });
  fs.writeFileSync(pathFile, 'electron');

  if (!isReady()) {
    throw new Error('Electron install failed. Try: rm -rf node_modules/electron && npm install');
  }

  console.log('Electron installed successfully.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
