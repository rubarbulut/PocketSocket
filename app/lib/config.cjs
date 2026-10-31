'use strict';
const PRESETS = Object.freeze({
  discord: { title: 'Discord', processes: ['Discord', 'Discord Helper', 'Discord Helper (Renderer)', 'Discord Helper (GPU)', 'Discord Helper (Plugin)'] },
  discordptb: { title: 'Discord PTB', processes: ['Discord PTB', 'Discord PTB Helper', 'Discord PTB Helper (Renderer)', 'Discord PTB Helper (GPU)', 'Discord PTB Helper (Plugin)'] },
  discordcanary: { title: 'Discord Canary', processes: ['Discord Canary', 'Discord Canary Helper', 'Discord Canary Helper (Renderer)', 'Discord Canary Helper (GPU)', 'Discord Canary Helper (Plugin)'] }
});
function buildConfig(profile, selected, port, secret) {
  if (!Array.isArray(selected) || !selected.length || selected.some(id => !Object.hasOwn(PRESETS, id))) throw new Error('En az bir desteklenen uygulama seç.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('Kontrol bağlantısı geçersiz.');
  const processes = [...new Set(selected.flatMap(id => PRESETS[id].processes))];
  const rules = [];
  for (const process of processes) {
    // Do not let a cached AAAA connection escape the tunnel on an IPv4-only profile.
    if (!profile.ipv6) rules.push(`AND,((PROCESS-NAME,${process}),(IP-CIDR6,::/0)),REJECT`);
    rules.push(`PROCESS-NAME,${process},PocketTunnel`);
  }
  rules.push('MATCH,DIRECT');
  return {
    mode: 'rule', 'log-level': 'warning', ipv6: true,
    'allow-lan': false, 'bind-address': '127.0.0.1',
    'find-process-mode': 'always',
    'external-controller': `127.0.0.1:${port}`, secret,
    profile: { 'store-selected': false, 'store-fake-ip': false },
    tun: {
      enable: true, stack: 'mixed', 'auto-route': true,
      'auto-detect-interface': true, 'strict-route': false, mtu: 1500,
      'dns-hijack': ['any:53', 'tcp://any:53']
    },
    dns: {
      enable: true, listen: '127.0.0.1:0', ipv6: Boolean(profile.ipv6),
      'enhanced-mode': 'redir-host',
      'default-nameserver': ['1.1.1.1', '8.8.8.8'],
      nameserver: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
      'proxy-server-nameserver': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
      'direct-nameserver': ['system']
    },
    proxies: [profile], rules
  };
}
function summarizeConnections(payload) {
  return (payload.connections || []).slice(-80).reverse().map(c => ({
    app: c.metadata?.process || 'Tanımlanamadı',
    destination: c.metadata?.host || c.metadata?.destinationIP || '—',
    network: c.metadata?.network || '—',
    route: (c.chains || []).includes('PocketTunnel') ? 'Tünel' : (c.chains || []).includes('DIRECT') ? 'Doğrudan' : 'Diğer'
  }));
}
module.exports = { PRESETS, buildConfig, summarizeConnections };
