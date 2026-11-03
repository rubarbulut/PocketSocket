'use strict';
const {PRESETS,ruleMatches}=require('./apps.cjs');
const RESOLVERS={cloudflare:['https://1.1.1.1/dns-query'],google:['https://8.8.8.8/dns-query'],quad9:['https://9.9.9.9/dns-query']};
function buildConfig(profile, selected, port, secret, options={}) {
  const platform=options.platform||process.platform, dnsOnly=options.mode==='dns';
  const matches=dnsOnly?[]:ruleMatches(selected,options.customApps||[],platform);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('Kontrol bağlantısı geçersiz.');
  const rules = [];
  for (const match of matches) {
    // Do not let a cached AAAA connection escape the tunnel on an IPv4-only profile.
    if (profile.type==='wireguard'&&!profile.ipv6) rules.push(`AND,((${match}),(IP-CIDR6,::/0)),REJECT`);
    rules.push(`${match},PocketRoute`);
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
      'auto-detect-interface': true, 'strict-route': platform==='win32', mtu: 1500,
      'dns-hijack': ['any:53', 'tcp://any:53']
    },
    dns: {
      enable: true, listen: '127.0.0.1:0', ipv6: dnsOnly||profile.type==='socks5'||Boolean(profile.ipv6),
      'enhanced-mode': 'redir-host',
      'default-nameserver': ['1.1.1.1', '8.8.8.8'],
      nameserver: RESOLVERS[options.resolver]||RESOLVERS.cloudflare,
      'proxy-server-nameserver': RESOLVERS[options.resolver]||RESOLVERS.cloudflare,
      ...(dnsOnly?{}:{'direct-nameserver':['system']})
    },
    proxies: dnsOnly?[]:[profile],
    'proxy-groups':dnsOnly?[]:[{name:'PocketRoute',type:'select',proxies:['PocketTunnel','REJECT',...(options.failurePolicy==='direct'?['DIRECT']:[])]}], rules
  };
}
function summarizeConnections(payload) {
  return (payload.connections || []).slice(-80).reverse().map(c => ({
    app: c.metadata?.process || 'Tanımlanamadı',
    destination: c.metadata?.host || c.metadata?.destinationIP || '—',
    network: c.metadata?.network || '—',
    route: (c.chains || []).includes('PocketTunnel') ? 'tunnel' : (c.chains || []).includes('DIRECT') ? 'direct' : 'other',
    upload:Number(c.upload)||0,download:Number(c.download)||0
  }));
}
module.exports = { PRESETS, RESOLVERS, buildConfig, summarizeConnections };
