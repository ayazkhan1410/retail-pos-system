const fs = require('node:fs');
const path = require('node:path');

module.exports = function checkResources() {
  const root = path.resolve(__dirname, '..');
  const files = [
    'build/server/tijori-server.exe',
    'build/server/staticfiles/admin/css/base.css',
    'build/postgres/bin/postgres.exe',
    'build/postgres/bin/initdb.exe',
    'build/postgres/bin/pg_dump.exe',
    'build/postgres/share/postgresql.conf.sample',
    'service/install.ps1',
    'service/TijoriService.exe',
    '../frontend/dist/index.html',
  ];
  for (const dir of ['build/postgres/bin', 'build/server']) {
    for (const dll of ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']) {
      files.push(`${dir}/${dll}`);
    }
  }
  for (const file of files) {
    if (!fs.existsSync(path.resolve(root, file))) throw new Error(`Missing installer resource: ${file}. Run the Windows build steps first.`);
  }
  for (const folder of ['build/server', 'build/postgres']) {
    for (const item of fs.readdirSync(path.resolve(root, folder), { recursive: true })) {
      if (/\.(py|pyc|pyo)$/i.test(item)) throw new Error(`Uncompiled Python source in installer: ${item}`);
    }
  }
};
