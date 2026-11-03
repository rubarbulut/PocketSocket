'use strict';
const https=require('node:https');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
function httpsProbe(host,path='/',ip) {
  return new Promise(resolve=>{
    const started=performance.now();
    const request=https.get({hostname:host,path,servername:host,agent:false,timeout:6500,...(ip?{lookup:(_hostname,options,callback)=>options.all?callback(null,[{address:ip,family:4}]):callback(null,ip,4)}:{})},response=>{
      const ok=response.statusCode>=200&&response.statusCode<400;
      response.resume(); resolve({ok,ms:Math.round(performance.now()-started),status:response.statusCode});
    });
    request.on('timeout',()=>request.destroy()); request.on('error',()=>resolve({ok:false,ms:null}));
  });
}
async function directCheck() {return httpsProbe('discord.com','/api/v10/gateway');}
async function dnsCheck() {
  try {
    const r=await fetch('https://cloudflare-dns.com/dns-query?name=discord.com&type=A',{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(6500)});
    if(!r.ok) return {ok:false,ms:null};
    const json=await r.json();
    const address=json.Answer?.find(a=>a.type===1&&require('node:net').isIP(a.data)===4)?.data;
    if(!address) return {ok:false,ms:null};
    return httpsProbe('discord.com','/api/v10/gateway',address);
  } catch{return {ok:false,ms:null};}
}
function networkSignature() {
  return Object.entries(os.networkInterfaces()).filter(([name])=>!/^utun|^tun|pocketsocket|mihomo/i.test(name)).flatMap(([name,addresses])=>(addresses||[]).filter(a=>!a.internal).map(a=>`${name}:${a.address}`)).sort().join('|');
}
function supportReport({version,platform,arch,state,settings,profileCount,storageAvailable}) {
  // Explicit allowlist: no keys, profile names, endpoints, process paths, IPs or destinations.
  return {version,platform,arch,generatedAt:new Date().toISOString(),mode:settings.mode,resolver:settings.resolver,profileCount,storageAvailable,
    session:{phase:state.phase,code:state.code,mode:state.mode||null,health:state.health?Object.fromEntries(['outbound','discord','directMs','tunnelMs','discordMs','udpObserved','checkedAt'].filter(k=>Object.hasOwn(state.health,k)).map(k=>[k,state.health[k]])):null},
    resources:{memoryMB:Math.round(process.memoryUsage().rss/1048576)},
    note:'Contains no imported profiles, connection history, IP addresses, filenames or user identifiers.'};
}
module.exports={httpsProbe,directCheck,dnsCheck,networkSignature,supportReport};
