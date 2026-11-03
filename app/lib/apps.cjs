'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {AppError}=require('./errors.cjs');
const run=promisify(execFile);
const macHelpers=name=>[name,`${name} Helper`,`${name} Helper (Renderer)`,`${name} Helper (GPU)`,`${name} Helper (Plugin)`];
const PRESETS={
  discord:{title:'Discord',darwin:macHelpers('Discord'),win32:['Discord.exe'],linux:['Discord','discord']},
  discordptb:{title:'Discord PTB',darwin:macHelpers('Discord PTB'),win32:['DiscordPTB.exe'],linux:['DiscordPTB','discord-ptb']},
  discordcanary:{title:'Discord Canary',darwin:macHelpers('Discord Canary'),win32:['DiscordCanary.exe'],linux:['DiscordCanary','discord-canary']},
  telegram:{title:'Telegram',darwin:['Telegram'],win32:['Telegram.exe'],linux:['telegram-desktop','Telegram']},
  signal:{title:'Signal',darwin:macHelpers('Signal'),win32:['Signal.exe'],linux:['signal-desktop','signal']},
  slack:{title:'Slack',darwin:macHelpers('Slack'),win32:['slack.exe'],linux:['slack']},
  firefox:{title:'Firefox',browser:true,darwin:['firefox','plugin-container'],win32:['firefox.exe'],linux:['firefox']},
  chrome:{title:'Google Chrome',browser:true,darwin:macHelpers('Google Chrome'),win32:['chrome.exe'],linux:['chrome','google-chrome']},
  edge:{title:'Microsoft Edge',browser:true,darwin:macHelpers('Microsoft Edge'),win32:['msedge.exe'],linux:['msedge']}
};
function descriptors(custom=[],platform=process.platform) {
  return [...Object.entries(PRESETS).map(([id,p])=>({id,title:p.title,browser:!!p.browser,processes:p[platform]||[]})),...custom.map(p=>({...p,custom:true}))];
}
function ruleMatches(ids,custom=[],platform=process.platform) {
  if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string')) throw new AppError('APP_REQUIRED');
  const registry=descriptors(custom,platform);
  return [...new Set(ids)].flatMap(id=>{
    const app=registry.find(p=>p.id===id);
    if(!app) throw new AppError('APP_INVALID');
    if(!app.custom) return app.processes.map(p=>`PROCESS-NAME,${p}`);
    if(typeof app.path!=='string'||/[,\n\r\0]/.test(app.path)||!(platform==='win32'?path.win32:path.posix).isAbsolute(app.path)) throw new AppError('APP_INVALID');
    if(platform==='darwin'&&app.path.endsWith('.app')) return [`PROCESS-PATH-REGEX,^${app.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/Contents/.*`];
    return [`PROCESS-PATH,${app.path}`];
  });
}
async function appDescriptor(filename) {
  const actual=await fs.realpath(filename), info=await fs.stat(actual);
  if(/[,\n\r\0]/.test(actual)) throw new AppError('APP_INVALID');
  if(process.platform==='darwin' ? !info.isDirectory()||!actual.endsWith('.app') : !info.isFile()||(process.platform==='win32'&&!actual.toLowerCase().endsWith('.exe'))) throw new AppError('APP_INVALID');
  const title=path.basename(actual).replace(/\.(app|exe)$/i,'');
  return {id:'app:'+createHash('sha256').update(actual).digest('hex').slice(0,20),title,path:actual,browser:/chrome|firefox|edge|safari|brave|opera/i.test(title)};
}
async function discover() {
  let filenames=[];
  if(process.platform==='darwin') {
    for(const dir of ['/Applications',path.join(os.homedir(),'Applications')]) try { filenames.push(...(await fs.readdir(dir)).filter(n=>n.endsWith('.app')).map(n=>path.join(dir,n))); } catch {}
  } else if(process.platform==='win32') {
    const script=`$ErrorActionPreference='SilentlyContinue'; $w=New-Object -ComObject WScript.Shell; $roots=@([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu')); $items=@(Get-ChildItem -LiteralPath $roots -Filter '*.lnk' -Recurse | Select-Object -First 180 | ForEach-Object { $p=$w.CreateShortcut($_.FullName).TargetPath; if($p -and $p.EndsWith('.exe') -and $_.BaseName -notmatch 'uninstall|installer|updater' -and (Test-Path -LiteralPath $p)) { $p } }); ConvertTo-Json -InputObject $items -Compress`;
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,maxBuffer:1024*1024});
    filenames=JSON.parse(stdout||'[]');
  } else {
    for(const dir of ['/usr/share/applications',path.join(os.homedir(),'.local/share/applications')]) try {
      for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.desktop')).slice(0,120)) {
        const content=await fs.readFile(path.join(dir,name),'utf8');
        const exe=content.match(/^Exec=(?:"([^"]+)"|(\/\S+))/m);
        if(exe) filenames.push(exe[1]||exe[2]);
      }
    } catch {}
  }
  const result=[];
  for(const filename of [...new Set(filenames)].slice(0,120)) try { result.push(await appDescriptor(filename)); } catch {}
  return result.sort((a,b)=>a.title.localeCompare(b.title));
}
module.exports={PRESETS,descriptors,ruleMatches,appDescriptor,discover};
