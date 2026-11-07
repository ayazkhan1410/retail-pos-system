const { spawn } = require('node:child_process');
const path = require('node:path');

class ShopService {
  constructor(resources) {
    this.client = path.join(resources, 'service', 'TijoriService.exe');
  }

  request(action, fields = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.client, ['--client'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      let diagnostic = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { diagnostic += chunk; });
      child.once('error', reject);
      child.stdin.once('error', reject);
      child.once('close', code => {
        try {
          if (code !== 0 || !output) throw new Error(diagnostic.trim() || 'The Tijori Windows service is unavailable.');
          const reply = JSON.parse(output);
          if (!reply.ok) {
            const error = new Error(reply.error || 'Store setup was declined.');
            error.userMessage = reply.userMessage;
            throw error;
          }
          resolve(reply.value);
        } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify({ action, ...fields }) + '\n', 'utf8');
    });
  }

  inspect() { return this.request('inspect'); }
  initializePostgres() { return this.request('initialize'); }
  migrate() { return this.request('migrate', { consent: true }); }
  setupStatus() { return this.request('status'); }
  setupShop(fields, password) { return this.request('setup', { fields, password }); }
  getConfig() { return this.request('config'); }
  start() { return this.request('start'); }
  stop() { return this.request('stop'); }
  beforeUpdate() { return this.request('beforeUpdate'); }
}

module.exports = { ShopService };
