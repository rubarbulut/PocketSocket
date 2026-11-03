'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const manifest = require('./core-manifest.json');
async function download(url) {
  for(let attempt=0;attempt<3;attempt++)try {
    const r=await fetch(url,{signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw new Error(`Download failed: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
}
(async () => {
  const target = process.argv[2] || `${process.platform}-${process.arch}`;
  const asset = manifest.assets[target];
  if (!asset) throw new Error(`Unsupported core target: ${target}`);
  const archive = await download(`https://github.com/MetaCubeX/mihomo/releases/download/${manifest.version}/${asset.name}`);
  if (createHash('sha256').update(archive).digest('hex') !== asset.sha256) throw new Error('Core checksum mismatch.');
  const dest = path.join(__dirname, '..', 'vendor', target);
  await fs.mkdir(dest, { recursive: true });
  if (asset.name.endsWith('.gz')) {
    await fs.writeFile(path.join(dest, 'mihomo'), gunzipSync(archive), { mode: 0o755 });
    await fs.chmod(path.join(dest, 'mihomo'), 0o755);
    if (process.platform === 'darwin') execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', path.join(dest, 'mihomo')]);
  } else {
    if (process.platform !== 'win32') throw new Error('Windows extraction requires Windows.');
    const zip = path.join(dest, 'core.zip');
    await fs.writeFile(zip, archive);
    const psQuote = s => "'" + s.replace(/'/g, "''") + "'";
    const command = `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(dest)} -Force`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference='SilentlyContinue'; "+command, 'utf16le').toString('base64')],{windowsHide:true});
    const files = await fs.readdir(dest);
    const exe = files.find(n => n.endsWith('.exe'));
    if (!exe) throw new Error('Core executable not found.');
    if (exe !== 'mihomo.exe') await fs.rename(path.join(dest, exe), path.join(dest, 'mihomo.exe'));
    await fs.unlink(zip);
  }
  await fs.writeFile(path.join(__dirname, '..', 'vendor', 'LICENSE.mihomo'), await download(`https://raw.githubusercontent.com/MetaCubeX/mihomo/${manifest.version}/LICENSE`));
  const bundle=path.join(__dirname,'..','vendor','bundle-'+target.split('-')[1]);
  await fs.mkdir(bundle,{recursive:true});
  const executable=target.startsWith('win32-')?'mihomo.exe':'mihomo';
  await fs.copyFile(path.join(dest,executable),path.join(bundle,executable));
  if(!target.startsWith('win32-'))await fs.chmod(path.join(bundle,executable),0o755);
  console.log(`Verified ${manifest.version} → vendor/${target}`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
