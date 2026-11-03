'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseWireGuard } = require('../app/lib/wireguard.cjs');
const { buildConfig, summarizeConnections } = require('../app/lib/config.cjs');
const { makeLaunchScript, shellQuote } = require('../app/lib/privilege.cjs');
const { profile, privateKey, publicKey } = require('./fixtures.cjs');
test('imports standard WireGuard without exposing shell hooks', () => {
  const p = parseWireGuard(profile);
  assert.equal(p.server, 'vpn.example.com');
  assert.equal(p.port, 51820);
  assert.equal(p.ip, '10.10.0.2');
  assert.equal(p['private-key'], privateKey);
  assert.equal(p['public-key'], publicKey);
  assert.equal(p['persistent-keepalive'], 25);
  assert.equal(p.mtu, 1420);
});
test('supports IPv6 endpoint and dual-stack interface', () => {
  const text = profile.replace('10.10.0.2/32', '10.10.0.2/32, fd00::2/128').replace('vpn.example.com:51820', '[2001:db8::1]:51820').replace('AllowedIPs = 0.0.0.0/0', 'AllowedIPs = 0.0.0.0/0, ::/0');
  const p = parseWireGuard(text);
  assert.equal(p.ipv6, 'fd00::2');
  assert.equal(p.server, '2001:db8::1');
  assert.deepEqual(p['allowed-ips'], ['0.0.0.0/0', '::/0']);
});
test('rejects scripts, custom keys, duplicate peers, bad keys, ports and partial routes', () => {
  for (const text of [
    profile.replace('DNS = 1.1.1.1', 'PostUp = touch /tmp/unsafe'),
    profile.replace('DNS = 1.1.1.1', 'Jc = 4'),
    profile + '\n[Peer]\nPublicKey = x',
    profile.replace(privateKey, 'bad-key'),
    profile.replace(':51820', ':0'),
    profile.replace(':51820', ':65536'),
    profile.replace('0.0.0.0/0', '10.0.0.0/8'),
    profile.replace('10.10.0.2/32', '10.10.0.2/33'),
    profile.replace('vpn.example.com', '$(touch /tmp/unsafe)'),
    profile.replace('DNS = 1.1.1.1', 'DNS = evil.example'),
    profile.replace('MTU = 1420', 'MTU = 99999'),
    profile.replace('DNS = 1.1.1.1', 'DNS = 1.1.1.1\nDNS = 8.8.8.8')
  ]) assert.throws(() => parseWireGuard(text));
});
test('default direct route and no domain rules keep other applications off the VPN', () => {
  const config = buildConfig(parseWireGuard(profile), ['discord'], 49150, 'a'.repeat(64),{platform:'darwin'});
  assert.equal(config.rules.at(-1), 'MATCH,DIRECT');
  assert(config.rules.includes('PROCESS-NAME,Discord,PocketRoute'));
  assert(config.rules.includes('PROCESS-NAME,Discord Helper (Renderer),PocketRoute'));
  assert(!config.rules.some(r => r.includes('League') || r.includes('DOMAIN')));
  assert(config.rules.includes('AND,((PROCESS-NAME,Discord),(IP-CIDR6,::/0)),REJECT'));
  assert.equal(config['external-controller'], '127.0.0.1:49150');
  assert.equal(config['allow-lan'], false);
  assert.equal(config.dns.ipv6, false);
});
test('does not accept arbitrary process/rule injection or empty selection', () => {
  for (const selected of [[], ['discord,MATCH,VPN'], ['toString'], '__proto__', null]) {
    assert.throws(() => buildConfig(parseWireGuard(profile), selected, 49150, 'a'.repeat(64)));
  }
});
test('diagnostics omit connection identifiers and imported key material', () => {
  const rows = summarizeConnections({ connections: [{ id: 'secret-id', metadata: { process: 'Discord', host: 'discord.com', network: 'udp', sourceIP: '192.168.1.2' }, chains: ['PocketTunnel'] }] });
  assert.deepEqual(rows, [{ app: 'Discord', destination: 'discord.com', network: 'udp', route: 'tunnel',upload:0,download:0 }]);
});
test('privileged launcher quotes paths and validates privileged parameters', () => {
  assert.equal(shellQuote("/Users/a'b/$stuff`cmd`"), "'/Users/a'\\''b/$stuff`cmd`'");
  const input = { core: "/Applications/My App's.app/core", config: '/private/tmp/a/config', supervisor: '/app/supervisor.sh', lease: '/tmp/lease', parentPid: 123, parentStart: 'Sat Oct 31 12:00:00 2026', coreHash: 'b'.repeat(64) };
  const script = makeLaunchScript(input);
  assert(script.startsWith('do shell script '));
  assert(script.endsWith('with administrator privileges'));
  assert(!script.includes('killall') && !script.includes('pkill'));
  assert.throws(() => makeLaunchScript({ ...input, parentPid: '123; dangerous' }));
});
