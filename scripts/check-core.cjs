'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { parseWireGuard } = require('../app/lib/wireguard.cjs');
const { buildConfig } = require('../app/lib/config.cjs');
const { profile } = require('../test/fixtures.cjs');
const run = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const net = require('node:net');
async function port() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
(async () => {
  const core = path.resolve('vendor', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'mihomo.exe' : 'mihomo');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocketsocket-check-'));
  let child;
  try {
    const config = buildConfig(parseWireGuard(profile), ['discord', 'discordptb', 'discordcanary'], await port(), 'c'.repeat(64));
    const filename = path.join(dir, 'config.json');
    // First check the exact production TUN config without enabling it.
    await fs.writeFile(filename, JSON.stringify(config));
    const validation = await run(core, ['-t', '-d', dir, '-f', filename], { timeout: 20000 });
    assert.match(validation.stdout + validation.stderr, /successful/i);
    console.log('Production TUN configuration accepted by pinned Mihomo.');
    // Runtime test has TUN disabled: it must not alter routes on the development/CI host.
    config.tun.enable = false;
    await fs.writeFile(filename, JSON.stringify(config));
    child = spawn(core, ['-d', dir, '-f', filename], { stdio: 'ignore' });
    let spawnError;
    child.once('error', e => { spawnError = e; });
    const url = `http://${config['external-controller']}`;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (spawnError) throw spawnError;
      try {
        const response = await fetch(url + '/version', { headers: { Authorization: `Bearer ${config.secret}` }, signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch { /* wait for core startup */ }
      await sleep(200);
    }
    assert(ready, 'Core did not start.');
    assert.equal((await fetch(url + '/configs')).status, 401);
    const active = await (await fetch(url + '/configs', { headers: { Authorization: `Bearer ${config.secret}` } })).json();
    assert.equal(active.mode, 'rule');
    assert.equal(active.tun.enable, false);
    const rules = await (await fetch(url + '/rules', { headers: { Authorization: `Bearer ${config.secret}` } })).json();
    assert.equal(rules.rules.at(-1).proxy, 'DIRECT');
    assert(rules.rules.some(r => r.proxy === 'PocketTunnel'));
    console.log('Core started without route changes; controller auth and live routing rules verified.');
  } finally {
    if (child && child.exitCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
