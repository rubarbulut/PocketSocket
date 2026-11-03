'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Tunnel}=require('../app/lib/tunnel.cjs');
const {windowsBootstrap}=require('../app/lib/platform.cjs');
function fake(failurePolicy='block',healthy=true){
  const tunnel=new Tunnel('unused',()=>{},'unused');const requests=[];
  tunnel.session={options:{mode:'tunnel',failurePolicy},route:'PocketTunnel'};
  tunnel.delay=async()=>healthy?42:null;
  tunnel.request=async(route,options={})=>{requests.push({route,...options});if(route==='/connections')return {connections:[{id:'game-id',chains:['DIRECT']},{id:'app-id',chains:['PocketRoute','PocketTunnel']}]};return null;};
  return {tunnel,requests};
}
test('server failure blocks only selected-app flows and never closes game/movie connections',async()=>{
  const {tunnel,requests}=fake('block',false);const health=await tunnel.checkHealth();
  assert.equal(health.outbound,false);assert.equal(tunnel.state.code,'OUTBOUND_UNREACHABLE');
  assert(requests.some(r=>r.route==='/proxies/PocketRoute'&&r.body.name==='REJECT'));
  assert(requests.some(r=>r.route==='/connections/app-id'&&r.method==='DELETE'));
  assert(!requests.some(r=>r.route==='/connections/game-id'||(r.route==='/connections'&&r.method==='DELETE')));
});
test('direct fallback is explicit and healthy checks recover tunnel selection',async()=>{
  const {tunnel,requests}=fake('direct',false);await tunnel.checkHealth();assert.equal(tunnel.state.code,'DIRECT_FALLBACK');assert(requests.some(r=>r.body?.name==='DIRECT'));
  tunnel.delay=async()=>23;await tunnel.checkHealth();assert.equal(tunnel.state.code,'OUTBOUND_VERIFIED');assert(requests.some(r=>r.body?.name==='PocketTunnel'));
});
test('failed DNS checks never claim selected traffic was blocked or create a VPN group request',async()=>{
  const {tunnel,requests}=fake('block',false);tunnel.session.options.mode='dns';await tunnel.checkHealth();assert.equal(tunnel.state.code,'DNS_UNVERIFIED');assert(!requests.some(r=>r.route==='/proxies/PocketRoute'));
});
test('disconnect disables TUN before cancelling the privileged session lease',async()=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-disconnect-'));const lease=path.join(stage,'lease');await fs.writeFile(lease,'');
  const tunnel=new Tunnel('unused',()=>{},'unused');let released=false;
  tunnel.session={stage,lease,done:Promise.resolve(),exited:false};
  tunnel.request=async(route,options)=>{assert.equal(route,'/configs');assert.equal(options.body.tun.enable,false);assert.equal(await fs.readFile(lease,'utf8'),'');released=true;};
  await tunnel.disconnect();assert(released);assert.equal(tunnel.session,null);assert.equal(tunnel.state.phase,'idle');await assert.rejects(fs.access(stage));
});
test('Windows elevation transports paths/data as base64 rather than executable shell text',()=>{
  const input={core:"C:\\Users\\a'b\\$(unsafe)\\mihomo.exe",config:'C:\\temp\\config.json',lease:'C:\\temp\\lease',parentPid:123,parentStart:'1234',coreHash:'a'.repeat(64)};
  const script=windowsBootstrap('param($Manifest) exit 0',input);
  assert(!script.includes(input.core));assert(!script.includes('$(unsafe)'));assert(script.includes('-WindowStyle Hidden'));assert(script.includes('-Verb RunAs'));
});
