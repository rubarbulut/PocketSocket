'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { buildConfig, summarizeConnections } = require('./config.cjs');
const { makeLaunchScript } = require('./privilege.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  return port;
}
class Tunnel {
  constructor(core, onChange, supervisor = path.join(__dirname, '..', 'supervisor.sh')) {
    this.core = core;
    this.supervisor = supervisor;
    this.onChange = onChange;
    this.state = { phase: 'idle', message: 'Başlamak için kendi WireGuard profilini seç.', connections: [], hasSession: false };
    this.session = null;
  }
  emit(patch) { Object.assign(this.state, patch, { hasSession: Boolean(this.session) }); this.onChange({ ...this.state }); }
  async request(route) {
    const s = this.session;
    if (!s) throw new Error('Bağlantı oturumu bulunamadı.');
    // Built-in http bypasses all system proxy configuration; never transmit this bearer externally.
    const http = require('node:http');
    return new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: s.port, path: route, headers: { Authorization: `Bearer ${s.secret}` }, timeout: 2000, agent: false }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; if (body.length > 2e6) req.destroy(new Error('Yanıt çok büyük.')); });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error('Kontrol bağlantısı kurulamadı.'));
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Kontrol yanıtı geçersiz.')); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Kontrol bağlantısı zaman aşımına uğradı.')));
      req.on('error', reject);
    });
  }
  async connect(profile, selected) {
    if (process.platform !== 'darwin') throw new Error('Tünel bağlantısı bu sürümde yalnızca macOS 13 ve üzerinde çalışır.');
    if (this.session) throw new Error('Mevcut bağlantının kapanmasını bekle.');
    await fs.access(this.core).catch(() => { throw new Error('Bağlantı motoru eksik. Geliştirici: npm run core:fetch çalıştır.'); });
    const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'pocketsocket-'));
    await fs.chmod(stage, 0o700);
    const s = { stage, lease: path.join(stage, 'lease'), port: await freePort(), secret: randomBytes(32).toString('hex'), exited: false, stopping: false };
    this.session = s;
    this.emit({ phase: 'connecting', message: 'macOS yönetici iznini onayla. Bağlantı hazırlanıyor.', connections: [] });
    try {
      const config = path.join(stage, 'config.json');
      await fs.writeFile(config, JSON.stringify(buildConfig(profile, selected, s.port, s.secret)), { mode: 0o600 });
      await fs.writeFile(s.lease, '', { mode: 0o600 });
      s.heartbeat = setInterval(() => fs.utimes(s.lease, new Date(), new Date()).catch(() => {}), 2000);
      // Validation cannot change system routes. Never display the core's raw output (may contain secrets).
      await run(this.core, ['-t', '-d', stage, '-f', config], { timeout: 15000, maxBuffer: 1024 * 1024 });
      const parentStart = (await run('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='])).stdout.replace(/\n$/, '');
      const coreHash = createHash('sha256').update(await fs.readFile(this.core)).digest('hex');
      const apple = makeLaunchScript({ core: this.core, config, supervisor: this.supervisor, lease: s.lease, parentPid: process.pid, parentStart, coreHash });
      const script = path.join(stage, 'launch.applescript');
      await fs.writeFile(script, apple, { mode: 0o600 });
      s.child = spawn('/usr/bin/osascript', [script], { stdio: ['ignore', 'ignore', 'pipe'] });
      let adminError = '';
      s.child.stderr.on('data', data => { adminError = (adminError + data).slice(-4096); });
      s.done = new Promise(resolve => {
        const finish = () => {
          if (s.exited) return;
          s.exited = true;
          s.cancelled = adminError.includes('-128');
          resolve();
          if (!s.stopping && this.state.phase === 'connected') this.abort(s, 'Bağlantı motoru durdu; tünel kapatıldı.').catch(() => {});
        };
        s.child.once('exit', finish);
        s.child.once('error', finish);
      });
      const deadline = Date.now() + 120000;
      let ready = false;
      while (Date.now() < deadline && !s.exited && !s.stopping) {
        try {
          await this.request('/version');
          const active = await this.request('/configs');
          if (active.tun?.enable === true && active.mode === 'rule') { ready = true; break; }
        } catch { /* Authentication rejects unrelated listeners if the selected port was raced. */ }
        await sleep(350);
      }
      if (!ready) throw new Error(s.cancelled ? 'Yönetici izni iptal edildi.' : 'Tünel başlatılamadı. Profilini ve macOS ağ izinlerini kontrol et.');
      // The controller being alive is not proof of a WireGuard handshake or Discord availability.
      this.emit({ phase: 'connected', message: 'Yönlendirme etkin. Discord erişimini ve sesi şimdi test et.' });
      s.poll = setInterval(async () => {
        if (s.polling || s.stopping) return;
        s.polling = true;
        try {
          const payload = await this.request('/connections');
          s.failures = 0;
          if (this.session === s && !s.stopping) this.emit({ connections: summarizeConnections(payload) });
        } catch {
          s.failures = (s.failures || 0) + 1;
          if (s.failures >= 3) await this.abort(s, 'Bağlantı motoruna ulaşılamıyor; tünel kapatıldı.');
        } finally { s.polling = false; }
      }, 2000);
    } catch (e) {
      const message = e.cmd ? 'Bağlantı yapılandırması motor tarafından kabul edilmedi.' : e.message;
      await this.abort(s, message);
      throw new Error(message);
    }
  }
  async abort(s, message) {
    if (this.session !== s || s.stopping) return;
    await this.disconnect();
    this.emit({ phase: 'error', message });
  }
  async disconnect() {
    const s = this.session;
    if (!s || s.stopping) return;
    s.stopping = true;
    this.emit({ phase: 'disconnecting', message: 'Tünel kapatılıyor…' });
    clearInterval(s.heartbeat);
    clearInterval(s.poll);
    await fs.unlink(s.lease).catch(() => {});
    // The privileged supervisor owns and terminates its child; no broad killall/pkill.
    if (s.done) {
      const stopped = await Promise.race([s.done.then(() => true), sleep(20000).then(() => false)]);
      if (!stopped) {
        s.stopping = false;
        this.emit({ phase: 'error', message: 'Kapanış henüz doğrulanamadı. macOS izin penceresini kapat ve Bağlantıyı kes düğmesine tekrar bas.' });
        return;
      }
    }
    await fs.rm(s.stage, { recursive: true, force: true });
    this.session = null;
    this.emit({ phase: 'idle', message: 'Tünel kapalı. Normal bağlantın etkin.', connections: [] });
  }
}
module.exports = { Tunnel };
