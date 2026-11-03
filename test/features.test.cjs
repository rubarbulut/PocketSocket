'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Store,settings}=require('../app/lib/store.cjs');
const {localProxy}=require('../app/lib/connections.cjs');
const {ruleMatches}=require('../app/lib/apps.cjs');
const {buildConfig}=require('../app/lib/config.cjs');
const {parseWireGuard}=require('../app/lib/wireguard.cjs');
const {verifyManifest,newer,allowedURL}=require('../app/lib/updates.cjs');
const {supportReport}=require('../app/lib/diagnostics.cjs');
const {en,tr}=require('../app/ui/i18n.js');
const {profile,privateKey}=require('./fixtures.cjs');
const key=crypto.randomBytes(32);
const protectedCrypto={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data])},decryptStringAsync:async buffer=>{const d=crypto.createDecipheriv('aes-256-gcm',key,buffer.subarray(0,12));d.setAuthTag(buffer.subarray(12,28));return {result:Buffer.concat([d.update(buffer.subarray(28)),d.final()]).toString('utf8'),shouldReEncrypt:false}}};
test('secure profiles survive restart without writing private keys or proxy passwords in plaintext',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-store-'));
  try{const s=await new Store(dir,protectedCrypto).load();const added=await s.add('Personal',parseWireGuard(profile),true);assert.equal(added.persisted,true);const disk=await fs.readFile(path.join(dir,'settings.json'),'utf8');assert(!disk.includes(privateKey));assert(!JSON.stringify(s.list()).includes('ciphertext'));const restored=await new Store(dir,protectedCrypto).load();assert.equal((await restored.get(added.id))['private-key'],privateKey);await restored.remove(added.id);assert.equal(restored.list().length,0);}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('unavailable or plaintext key stores never persist profiles',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-store-'));
  try{const s=await new Store(dir,{...protectedCrypto,getSelectedStorageBackend:()=> 'basic_text'}).load();const p=await s.add('Temporary',parseWireGuard(profile),true);assert.equal(p.persisted,false);assert.equal((await s.get(p.id)).type,'wireguard');assert.equal((await new Store(dir,protectedCrypto).load()).list().length,0);}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('profile settings reject unsupported enums and bounded selections',()=>{
  const result=settings({theme:'injected',mode:'bad',selected:['discord','MATCH,DIRECT',null],notifications:'yes'});assert.equal(result.theme,'system');assert.equal(result.mode,'tunnel');assert.deepEqual(result.selected,['discord']);assert.equal(result.notifications,false);
});
test('platform presets and custom app rules cannot inject extra routes',()=>{
  assert(ruleMatches(['discord'],[],'win32').includes('PROCESS-NAME,Discord.exe'));
  const custom={id:'app:12345678901234567890',title:'Example',path:'/Applications/Example (Beta).app'};
  assert.match(ruleMatches([custom.id],[custom],'darwin')[0],/^PROCESS-PATH-REGEX/);
  assert.throws(()=>ruleMatches([custom.id],[{...custom,path:'/bad,MATCH,DIRECT'}],'darwin'));
  assert.throws(()=>ruleMatches(['constructor'],[],'darwin'));
});
test('DNS-only mode never creates a VPN outbound or app routing rules',()=>{
  const c=buildConfig(null,[],49152,'a'.repeat(64),{mode:'dns',resolver:'quad9',platform:'win32'});
  assert.deepEqual(c.proxies,[]);assert.deepEqual(c.rules,['MATCH,DIRECT']);assert.equal(c.tun['strict-route'],true);assert.equal(c.dns.nameserver[0],'https://9.9.9.9/dns-query');assert(!c.dns['direct-nameserver']);
});
test('SOCKS is restricted to local addresses and UDP is opt-in',()=>{
  const p=localProxy({host:'127.0.0.1',port:1080,password:'secret'});assert.equal(p.udp,false);assert.equal(p.password,'secret');for(const host of ['evil.example','127.0.0.1.evil','0.0.0.0'])assert.throws(()=>localProxy({host,port:1080}));assert.throws(()=>localProxy({host:'localhost',port:0}));
});
test('updates reject forged manifests, unsafe downloads and malformed checksums',()=>{
  const pair=crypto.generateKeyPairSync('ed25519');
  const data={version:'0.2.0',files:[{name:'PocketSocket-0.2.0-mac-arm64.dmg',url:'https://github.com/rubarbulut/PocketSocket/releases/download/v0.2.0/a.dmg',size:123,sha256:'a'.repeat(64)}]};
  const envelope=value=>{const b=Buffer.from(JSON.stringify(value));return {payload:b.toString('base64'),signature:crypto.sign(null,b,pair.privateKey).toString('base64')}};
  assert.equal(verifyManifest(envelope(data),pair.publicKey).version,'0.2.0');
  const forged=envelope(data);forged.payload=Buffer.from('{}').toString('base64');assert.throws(()=>verifyManifest(forged,pair.publicKey));
  assert.throws(()=>verifyManifest(envelope({...data,files:[{...data.files[0],sha256:'_'.repeat(64)}]}),pair.publicKey));
  assert.throws(()=>verifyManifest(envelope({...data,files:[{...data.files[0],url:'https://evil.example/setup.exe'}]}),pair.publicKey));
  assert.equal(allowedURL('https://github.com.evil.example/rubarbulut/PocketSocket/releases/download/a'),false);
  assert(newer('0.2.0','0.1.0'));assert(newer('0.2.0','0.2.0-beta.1'));assert(!newer('0.1.9','0.2.0'));assert(!newer('bad','0.2.0'));
});
test('support exports omit private configuration and connection destinations',()=>{
  const r=supportReport({version:'0.2.0',platform:'win32',arch:'x64',state:{phase:'connected',code:'ROUTING_ACTIVE',connections:[{destination:'private.example'}],secret:privateKey},settings:{mode:'tunnel',resolver:'cloudflare',customApps:[{path:'C:/Users/Private/Secret.exe'}]},profileCount:1,storageAvailable:true});
  const raw=JSON.stringify(r);assert(!raw.includes(privateKey));assert(!raw.includes('private.example'));assert(!raw.includes('Secret.exe'));
});
test('English and Turkish have matching complete translation dictionaries',()=>{assert.deepEqual(Object.keys(en).sort(),Object.keys(tr).sort());for(const key of Object.keys(en)){assert(en[key]);assert(tr[key]);}});
