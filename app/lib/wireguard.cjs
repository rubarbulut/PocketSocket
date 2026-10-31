'use strict';
const { isIP } = require('node:net');

function fail(message) { throw new Error(message); }
function key(value, name) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || '') || Buffer.from(value, 'base64').length !== 32)
    fail(`${name}: geçerli bir WireGuard anahtarı gerekiyor.`);
  return value;
}
function integer(value, name, min, max) {
  if (!/^\d+$/.test(value || '') || Number(value) < min || Number(value) > max)
    fail(`${name}: ${min}–${max} arasında bir sayı gerekiyor.`);
  return Number(value);
}
function cidr(value) {
  const [ip, bits, extra] = value.split('/');
  const family = isIP(ip);
  if (!family || extra || !/^\d+$/.test(bits || '') || Number(bits) > (family === 4 ? 32 : 128))
    fail('Geçersiz IP/ağ adresi.');
  return { ip, family };
}

function parseWireGuard(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) fail('Dosya en fazla 64 KB olabilir.');
  const sections = { Interface: {}, Peer: {} };
  const allowed = {
    Interface: new Set(['PrivateKey', 'Address', 'DNS', 'MTU', 'ListenPort']),
    Peer: new Set(['PublicKey', 'PresharedKey', 'Endpoint', 'AllowedIPs', 'PersistentKeepalive'])
  };
  let section;
  const seenSections = new Set();
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const header = line.match(/^\[(\w+)\]$/);
    if (header) {
      section = header[1];
      if (!allowed[section] || seenSections.has(section)) fail('Tek Interface ve tek Peer içeren standart WireGuard dosyası gerekiyor.');
      seenSections.add(section);
      continue;
    }
    const entry = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!section || !entry) fail('WireGuard dosyasının biçimi geçersiz.');
    const [, name, value] = entry;
    if (!allowed[section].has(name)) fail(`Desteklenmeyen WireGuard alanı: ${name}. Script içeren veya özel protokollü dosyalar kabul edilmiyor.`);
    if (Object.hasOwn(sections[section], name)) fail(`Tekrarlanan alan: ${name}.`);
    sections[section][name] = value.trim();
  }
  const i = sections.Interface, p = sections.Peer;
  const addresses = (i.Address || '').split(',').map(v => cidr(v.trim()));
  const ipv4 = addresses.filter(v => v.family === 4), ipv6 = addresses.filter(v => v.family === 6);
  if (ipv4.length !== 1 || ipv6.length > 1) fail('Bir IPv4 ve isteğe bağlı bir IPv6 Interface adresi gerekiyor.');
  const endpoint = (p.Endpoint || '').match(/^(?:\[([0-9a-fA-F:]+)\]|([a-zA-Z0-9.-]+)):(\d+)$/);
  if (!endpoint) fail('Endpoint, sunucu:port biçiminde olmalı.');
  const server = endpoint[1] || endpoint[2];
  if (endpoint[1] && isIP(server) !== 6) fail('Endpoint IPv6 adresi geçersiz.');
  if (!isIP(server) && (!/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(server) || server.includes('..') || server.length > 253)) fail('Endpoint sunucu adı geçersiz.');
  const ranges = (p.AllowedIPs || '').split(',').map(v => v.trim());
  ranges.forEach(cidr);
  if (!ranges.includes('0.0.0.0/0')) fail('İnternet erişimi için AllowedIPs içinde 0.0.0.0/0 bulunan bir profil gerekiyor.');
  if (ipv6.length && !ranges.includes('::/0')) fail('IPv6 adresi olan profilde AllowedIPs içinde ::/0 da gerekiyor.');
  const dns = i.DNS ? i.DNS.split(',').map(v => v.trim()) : [];
  if (dns.some(v => !isIP(v))) fail('DNS alanı yalnızca IP adresleri içerebilir.');
  const profile = {
    name: 'PocketTunnel', type: 'wireguard', server,
    port: integer(endpoint[3], 'Endpoint portu', 1, 65535),
    ip: ipv4[0].ip, 'private-key': key(i.PrivateKey, 'PrivateKey'),
    'public-key': key(p.PublicKey, 'PublicKey'),
    'allowed-ips': ipv6.length ? ['0.0.0.0/0', '::/0'] : ['0.0.0.0/0'],
    udp: true
  };
  if (ipv6.length) profile.ipv6 = ipv6[0].ip;
  if (p.PresharedKey) profile['pre-shared-key'] = key(p.PresharedKey, 'PresharedKey');
  if (p.PersistentKeepalive) profile['persistent-keepalive'] = integer(p.PersistentKeepalive, 'PersistentKeepalive', 0, 65535);
  if (i.MTU) profile.mtu = integer(i.MTU, 'MTU', 1280, 1500);
  if (i.ListenPort) integer(i.ListenPort, 'ListenPort', 0, 65535);
  // DNS stays in the local core; never execute wg-quick hooks or import arbitrary YAML.
  return profile;
}
module.exports = { parseWireGuard };
