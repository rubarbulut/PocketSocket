'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {makeLaunchScript,shellQuote}=require('./privilege.cjs');
const {AppError}=require('./errors.cjs');
const run=promisify(execFile);
const encodedPS=script=>Buffer.from(script,'utf16le').toString('base64');
function windowsEnv(){return {...process.env,PSModulePath:path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')};}
async function secureStage(directory) {
  if(process.platform!=='win32')return fs.chmod(directory,0o700);
  const encoded=Buffer.from(directory).toString('base64');
  const script=`$ErrorActionPreference='Stop';$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetAccessRuleProtection($true,$false);$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a.SetOwner($u);foreach($s in @($u,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){$r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r)};Set-Acl -LiteralPath $p -AclObject $a`;
  await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encodedPS(script)],{windowsHide:true,env:windowsEnv(),timeout:10000});
}
function makeLinuxScript({core,config,supervisor,lease,coreHash,parentPid,parentStart}) {
  if(!Number.isInteger(parentPid)||parentPid<1||!/^[a-f0-9]{64}$/.test(coreHash))throw new AppError('START_FAILED');
  const q=shellQuote;
  return `set -eu
umask 077
root=$(/usr/bin/mktemp -d /tmp/pocketsocket.XXXXXXXX)
cleanup() { case "$root" in /tmp/pocketsocket.????????) /bin/rm -rf -- "$root" ;; esac; }
trap cleanup EXIT
/usr/bin/install -o root -g root -m 700 ${q(core)} "$root/mihomo"
/usr/bin/install -o root -g root -m 600 ${q(config)} "$root/config.json"
/usr/bin/install -o root -g root -m 700 ${q(supervisor)} "$root/supervisor.sh"
actual=$(/usr/bin/sha256sum "$root/mihomo" | /usr/bin/cut -d ' ' -f 1)
[ "$actual" = ${q(coreHash)} ] || exit 70
/bin/sh "$root/supervisor.sh" "$root" ${q(lease)} ${q(parentPid)} ${q(parentStart)}
`;
}
function windowsBootstrap(body,manifest) {
  const payload=Buffer.from(JSON.stringify(manifest)).toString('base64');
  const source=Buffer.from(body).toString('base64');
  const command=`& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}')))) '${payload}'`;
  const elevated=encodedPS(command);
  return `$ErrorActionPreference='Stop'; $p=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { ${command}; exit $LASTEXITCODE }; try { $child=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${elevated}' -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $child.ExitCode } catch { exit 1223 }`;
}
async function launch({core,config,supervisor,lease,coreHash,stage}) {
  if(process.platform==='win32') {
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encodedPS(`(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().Ticks.ToString()`) ],{windowsHide:true,env:windowsEnv(),timeout:10000});
    const body=await fs.readFile(supervisor,'utf8');
    const script=windowsBootstrap(body,{core,config,lease,coreHash,parentPid:process.pid,parentStart:stdout.trim()});
    // Avoid Windows' 32K command-line limit: the private bootstrap file contains the
    // outer launcher, while the elevated child still receives a bounded encoded script.
    const bootstrap=path.join(stage,'bootstrap.ps1');await fs.writeFile(bootstrap,script,{mode:0o600});
    return spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',bootstrap],{windowsHide:true,env:windowsEnv(),stdio:['ignore','ignore','pipe']});
  }
  const parentStart=(await run('/bin/ps',['-p',String(process.pid),'-o','lstart='])).stdout.replace(/\n$/,'');
  const args={core,config,supervisor,lease,parentPid:process.pid,parentStart,coreHash};
  if(process.platform==='darwin') {
    const script=path.join(stage,'launch.applescript');
    await fs.writeFile(script,makeLaunchScript(args),{mode:0o600});
    return spawn('/usr/bin/osascript',[script],{stdio:['ignore','ignore','pipe']});
  }
  if(process.platform==='linux') {
    const script=makeLinuxScript(args);
    try {await fs.access('/usr/bin/pkexec');} catch {throw new AppError('POLKIT_REQUIRED');}
    return spawn('/usr/bin/pkexec',['/bin/sh','-c',script],{stdio:['ignore','ignore','pipe']});
  }
  throw new AppError('PLATFORM_UNSUPPORTED');
}
module.exports={launch,windowsBootstrap,encodedPS,makeLinuxScript,secureStage,windowsEnv};
