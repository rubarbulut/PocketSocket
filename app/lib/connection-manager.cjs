'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {buildConfig,summarizeConnections}=require('./config.cjs');
const {launch,secureStage}=require('./platform.cjs');
const {directCheck,dnsCheck}=require('./diagnostics.cjs');
const {AppError}=require('./errors.cjs');
const run=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const port=server.address().port; await new Promise(r=>server.close(r)); return port;
}
class Tunnel {
  constructor(core,onChange,supervisor) {
    this.core=core;this.supervisor=supervisor;this.onChange=onChange;this.session=null;this.pending=false;this.visible=true;
    this.state={phase:'idle',code:'READY',connections:[],hasSession:false,health:null,mode:null};
  }
  emit(patch) {Object.assign(this.state,patch,{hasSession:!!this.session});this.onChange(structuredClone(this.state));}
  request(route,{method='GET',body,timeout=8000}={}) {
    const s=this.session;if(!s) return Promise.reject(new AppError('NOT_CONNECTED'));
    return new Promise((resolve,reject)=>{
      const serialized=body?JSON.stringify(body):null;
      const req=http.request({hostname:'127.0.0.1',port:s.port,path:route,method,agent:false,timeout,headers:{Authorization:`Bearer ${s.secret}`,...(serialized?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(serialized)}:{})}},res=>{
        let data='';res.setEncoding('utf8');res.on('data',chunk=>{data+=chunk;if(data.length>2e6)req.destroy(new AppError('CORE_RESPONSE'))});
        res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new AppError('CORE_UNREACHABLE'));try{resolve(data?JSON.parse(data):null)}catch{reject(new AppError('CORE_RESPONSE'))}});
      });req.on('timeout',()=>req.destroy(new AppError('CORE_TIMEOUT')));req.on('error',reject);if(serialized)req.write(serialized);req.end();
    });
  }
  async connect(profile,selected,options={}) {
    if(this.pending||this.session) throw new AppError('BUSY');
    this.pending=true;
    let s;
    try {
      this.emit({phase:'connecting',code:'PREPARING',connections:[],health:null});
      let mode=options.mode||'tunnel';
      if(mode==='auto') {
        const direct=await directCheck();
        if(direct.ok){this.emit({phase:'direct',code:'DIRECT_AVAILABLE',mode:'direct',health:{directMs:direct.ms,discord:true,outbound:null}});return;}
        mode=(await dnsCheck()).ok?'dns':'tunnel';
      }
      if(mode==='tunnel'&&!profile)throw new AppError('PROFILE_REQUIRED');
      if(!['darwin','win32','linux'].includes(process.platform))throw new AppError('PLATFORM_UNSUPPORTED');
      await fs.access(this.core).catch(()=>{throw new AppError('CORE_MISSING')});
      const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pocketsocket-'));
      await secureStage(stage);
      s={stage,lease:path.join(stage,'lease'),port:await freePort(),secret:randomBytes(32).toString('hex'),exited:false,stopping:false,options:{...options,mode},profile,selected,failures:0};
      this.session=s;
      this.emit({mode,code:'VALIDATING'});
      const filename=path.join(stage,'config.json');
      s.config=buildConfig(profile,selected,s.port,s.secret,{...options,mode});
      await fs.writeFile(filename,JSON.stringify(s.config),{mode:0o600});
      await fs.writeFile(s.lease,'',{mode:0o600});
      s.heartbeat=setInterval(()=>fs.utimes(s.lease,new Date(),new Date()).catch(()=>{}),2000);
      try {await run(this.core,['-t','-d',stage,'-f',filename],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});}catch{throw new AppError('CONFIG_REJECTED');}
      if(s.stopping)throw new AppError('CANCELLED');
      const coreHash=createHash('sha256').update(await fs.readFile(this.core)).digest('hex');
      if(s.stopping)throw new AppError('CANCELLED');
      this.emit({code:'PERMISSION_REQUIRED'});
      s.child=await launch({core:this.core,config:filename,supervisor:this.supervisor,lease:s.lease,coreHash,stage});
      let cancelled=false;
      s.child.stderr.on('data',data=>{if(data.toString().includes('-128'))cancelled=true;});
      s.done=new Promise(resolve=>{
        const finish=code=>{if(s.exited)return;s.exited=true;s.cancelled=cancelled||code===1223||code===126;resolve();if(!s.stopping&&!this.pending)this.abort(s,'RECONNECT_REQUIRED').catch(()=>{});};
        s.child.once('exit',finish);s.child.once('error',()=>finish(-1));
      });
      const deadline=Date.now()+120000;let ready=false;
      while(Date.now()<deadline&&!s.exited&&!s.stopping){
        try {const active=await this.request('/configs',{timeout:1200});if(active.tun?.enable&&active.mode==='rule'){ready=true;break}}catch{}
        await sleep(300);
      }
      if(!ready)throw new AppError(s.cancelled?'PERMISSION_CANCELLED':'START_FAILED');
      this.emit({phase:'connected',code:mode==='dns'?'DNS_ACTIVE':'ROUTING_ACTIVE'});
      await this.checkHealth();
      s.poll=setInterval(()=>this.poll(s).catch(()=>{}),2500);
    } catch(e) {
      const code=e.code&&/^[A-Z_]+$/.test(e.code)?e.code:'START_FAILED';
      if(s&&this.session===s)await this.disconnect();
      this.emit({phase:'error',code});throw new AppError(code);
    } finally {this.pending=false;}
  }
  async poll(s) {
    if(this.session!==s||s.stopping||s.polling)return;
    if(!this.visible&&Date.now()-(s.lastPoll||0)<10000)return;
    s.lastPoll=Date.now();s.polling=true;
    try {
      const payload=await this.request('/connections',{timeout:2000});s.failures=0;
      if(this.session!==s||s.stopping)return;
      const connections=summarizeConnections(payload);
      this.emit({connections,traffic:{upload:Number(payload.uploadTotal)||0,download:Number(payload.downloadTotal)||0},health:{...this.state.health,udpObserved:connections.some(c=>c.network==='udp'&&c.route==='tunnel'&&c.download>0)}});
      if(s.options.reconnect!==false&&Date.now()-(s.lastHealth||0)>30000)await this.checkHealth();
    }catch{if(++s.failures>=3)await this.abort(s,'RECONNECT_REQUIRED');}finally{s.polling=false;}
  }
  async delay(proxy,url,expected='200') {
    try {const r=await this.request(`/proxies/${encodeURIComponent(proxy)}/delay?url=${encodeURIComponent(url)}&timeout=5000&expected=${expected}`);return Number.isFinite(r?.delay)?r.delay:null;}catch{return null;}
  }
  async checkHealth() {
    const s=this.session;if(!s||s.stopping||s.checking)return this.state.health;
    s.checking=true;s.lastHealth=Date.now();
    try {
      const proxy=s.options.mode==='dns'?'DIRECT':'PocketTunnel';
      const [directMs,tunnelMs,discordMs]=await Promise.all([this.delay('DIRECT','https://www.gstatic.com/generate_204','204'),this.delay(proxy,'https://www.gstatic.com/generate_204','204'),this.delay(proxy,'https://discord.com/api/v10/gateway')]);
      if(this.session!==s||s.stopping)return;
      const ok=tunnelMs!==null;
      if(s.options.mode!=='dns') {
        const target=ok?'PocketTunnel':s.options.failurePolicy==='direct'?'DIRECT':'REJECT';
        await this.request('/proxies/PocketRoute',{method:'PUT',body:{name:target}});
        if(this.session!==s||s.stopping)return;
        if(target!==s.route){
          const active=await this.request('/connections');
          if(this.session!==s||s.stopping)return;
          // Never close DIRECT game/movie connections when a selected-app route changes.
          await Promise.allSettled((active.connections||[]).filter(c=>(c.chains||[]).includes('PocketRoute')&&/^[a-zA-Z0-9-]{1,80}$/.test(c.id||'')).slice(0,200).map(c=>this.request('/connections/'+encodeURIComponent(c.id),{method:'DELETE'})));
          s.route=target;
        }
      }
      if(this.session!==s||s.stopping)return;
      const health={outbound:ok,discord:discordMs!==null,directMs,tunnelMs,discordMs,udpObserved:this.state.health?.udpObserved||false,checkedAt:new Date().toISOString()};
      const code=ok?(s.options.mode==='dns'?'DNS_ACTIVE':discordMs!==null?'OUTBOUND_VERIFIED':'DISCORD_UNREACHABLE'):s.options.mode==='dns'?'DNS_UNVERIFIED':s.options.failurePolicy==='direct'?'DIRECT_FALLBACK':'OUTBOUND_UNREACHABLE';
      this.emit({health,code});return health;
    }finally{s.checking=false;}
  }
  async abort(s,code){if(this.session!==s||s.stopping)return;await this.disconnect();this.emit({phase:'error',code});}
  async disconnect() {
    const s=this.session;if(!s){this.emit({phase:'idle',code:'READY',mode:null,health:null});return;}
    if(s.stopping)return s.stopped;
    s.stopping=true;this.emit({phase:'disconnecting',code:'STOPPING'});
    s.stopped=(async()=>{
      clearInterval(s.heartbeat);clearInterval(s.poll);
      // Ask the core to release DNS/TUN/firewall state before the Windows process is stopped.
      if(!s.exited)try{await this.request('/configs',{method:'PATCH',body:{tun:{enable:false}},timeout:2000});}catch{}
      await fs.unlink(s.lease).catch(()=>{});
      if(s.done){let timeout;const stopped=await Promise.race([s.done.then(()=>true),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),20000)})]);clearTimeout(timeout);if(!stopped){s.stopping=false;this.emit({phase:'error',code:'STOP_UNCONFIRMED'});return;}}
      await fs.rm(s.stage,{recursive:true,force:true});this.session=null;
      this.emit({phase:'idle',code:'STOPPED',mode:null,health:null,connections:[],traffic:null});
    })();return s.stopped;
  }
}
module.exports={Tunnel};
