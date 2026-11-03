'use strict';
// Dedicated disposable GitHub runners only. Never alter a developer's routing.
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Privileged routing tests run only on disposable GitHub Actions runners.');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const assert=require('node:assert/strict');
const {buildConfig}=require('../app/lib/config.cjs');
const {parseWireGuard}=require('../app/lib/wireguard.cjs');
const {profile}=require('../test/fixtures.cjs');
const {makeLaunchScript}=require('../app/lib/privilege.cjs');
const {makeLinuxScript,windowsBootstrap,encodedPS,secureStage,windowsEnv}=require('../app/lib/platform.cjs');
const run=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
(async()=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-ci-'));let child,heartbeat,done;let logs='';
  const lease=path.join(stage,'lease');
  try{
    await secureStage(stage);
    const core=path.resolve('vendor',`${process.platform}-${process.arch}`,process.platform==='win32'?'mihomo.exe':'mihomo');
    const port=await freePort(),secret=crypto.randomBytes(32).toString('hex');
    const config=path.join(stage,'config.json');await fs.writeFile(config,JSON.stringify(buildConfig(parseWireGuard(profile),['discord'],port,secret)),{mode:0o600});
    await fs.writeFile(lease,'',{mode:0o600});heartbeat=setInterval(()=>fs.utimes(lease,new Date(),new Date()).catch(()=>{}),2000);
    const coreHash=crypto.createHash('sha256').update(await fs.readFile(core)).digest('hex');
    if(process.platform==='win32'){
      const identity=(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"],{env:windowsEnv(),windowsHide:true})).stdout.trim();
      assert.equal(identity,'True','Runner must already be elevated; CI never opens UAC.');
      const parentStart=(await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encodedPS(`(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().Ticks.ToString()`) ],{env:windowsEnv(),windowsHide:true})).stdout.trim();
      const command=windowsBootstrap(await fs.readFile('app/supervisor.ps1','utf8'),{core,config,lease,coreHash,parentPid:process.pid,parentStart});
      const bootstrap=path.join(stage,'bootstrap.ps1');await fs.writeFile(bootstrap,command,{mode:0o600});
      child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',bootstrap],{windowsHide:true,env:windowsEnv(),stdio:['ignore','pipe','pipe']});
    }else{
      const parentStart=(await run('/bin/ps',['-p',String(process.pid),'-o','lstart='])).stdout.replace(/\n$/,'');
      const args={core,config,lease,coreHash,parentPid:process.pid,parentStart,supervisor:path.resolve('app',process.platform==='darwin'?'supervisor.sh':'supervisor-linux.sh')};
      const shell=process.platform==='darwin'?JSON.parse(makeLaunchScript(args).slice('do shell script '.length,-' with administrator privileges'.length)):makeLinuxScript(args);
      const filename=path.join(stage,'launch.sh');await fs.writeFile(filename,shell,{mode:0o700});
      child=spawn('sudo',['-n','/bin/sh',filename],{stdio:['ignore','pipe','pipe']});
    }
    let exited=false;done=new Promise(resolve=>{child.once('exit',code=>{exited=true;resolve(code)});child.once('error',e=>{exited=true;logs+=e.message;resolve(-1)})});
    child.stdout.on('data',b=>logs+=b.toString());child.stderr.on('data',b=>logs+=b.toString());
    const url=`http://127.0.0.1:${port}`;let ready=false;
    for(let i=0;i<80&&!exited;i++){
      try{const r=await fetch(url+'/configs',{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(1000)});if(r.ok){const c=await r.json();if(c.tun?.enable){ready=true;break}}}catch{}await sleep(400);
    }
    assert(ready,'Privileged TUN startup failed: '+logs.slice(-5000));
    await fetch(url+'/configs',{method:'PATCH',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({tun:{enable:false}}),signal:AbortSignal.timeout(3000)});
    clearInterval(heartbeat);await fs.unlink(lease);
    let timeout;const result=await Promise.race([done,new Promise(r=>{timeout=setTimeout(()=>r('timeout'),20000)})]);clearTimeout(timeout);assert.notEqual(result,'timeout','Supervisor did not release its session.');
    let closed=false;try{await fetch(url+'/version',{signal:AbortSignal.timeout(2000)})}catch{closed=true}assert(closed,'Connection engine should stop when the lease ends.');
    console.log('Privileged supervisor: real TUN started, TUN disabled, lease released, core stopped. No real VPN account used.');
  }finally{clearInterval(heartbeat);await fs.unlink(lease).catch(()=>{});if(child&&child.exitCode===null){await Promise.race([done,sleep(15000)]);}await fs.rm(stage,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
