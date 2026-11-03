'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {verify,createHash,randomUUID}=require('node:crypto');
const {AppError}=require('./errors.cjs');
const REPO='rubarbulut/PocketSocket';
function allowedURL(url) {try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'&&u.pathname.startsWith(`/${REPO}/releases/download/`)}catch{return false}}
function version(value) {const m=/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?$/.exec(value||'');return m?m.slice(1):null;}
function newer(next,current){const a=version(next),b=version(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(Number(a[i])!==Number(b[i]))return Number(a[i])>Number(b[i]);}return !!b[3]&&!a[3];}
function verifyManifest(envelope,key){
  if(!envelope||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>200000)throw new AppError('UPDATE_UNTRUSTED');
  const payload=Buffer.from(envelope.payload,'base64');
  if(!verify(null,payload,key,Buffer.from(envelope.signature,'base64')))throw new AppError('UPDATE_UNTRUSTED');
  const manifest=JSON.parse(payload.toString('utf8'));
  if(!version(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length>40)throw new AppError('UPDATE_UNTRUSTED');
  for(const file of manifest.files)if(!/^[a-zA-Z0-9._-]+$/.test(file.name)||!allowedURL(file.url)||!(/^[a-f0-9]{64}$/).test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<1||file.size>1e9)throw new AppError('UPDATE_UNTRUSTED');
  return manifest;
}
async function json(url){const r=await fetch(url,{headers:{'User-Agent':'PocketSocket','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AppError(r.status===404?'UPDATE_NONE':'UPDATE_UNAVAILABLE');return r.json();}
class Updates {
  constructor(current,key){this.current=current;this.key=key;this.offer=null;}
  async check(channel='stable'){
    const releases=await json(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
    const release=releases.find(r=>!r.draft&&(channel==='beta'||!r.prerelease)&&newer(r.tag_name,this.current));
    if(!release){this.offer=null;return {available:false};}
    const asset=release.assets.find(a=>a.name==='pocketsocket-update.json');
    if(!asset||!allowedURL(asset.browser_download_url))throw new AppError('UPDATE_UNTRUSTED');
    const manifest=verifyManifest(await json(asset.browser_download_url),this.key);
    if(manifest.version!==release.tag_name.replace(/^v/,''))throw new AppError('UPDATE_UNTRUSTED');
    const suffix=process.platform==='darwin'?`mac-${process.arch}.dmg`:process.platform==='win32'?`win-${process.arch}.exe`:`linux-${process.arch}.AppImage`;
    const file=manifest.files.find(f=>f.name.endsWith(suffix));
    if(!file)throw new AppError('UPDATE_NONE');
    this.offer={version:manifest.version,file,releaseURL:`https://github.com/${REPO}/releases/tag/${encodeURIComponent(release.tag_name)}`};
    return {available:true,version:manifest.version,size:file.size,releaseURL:this.offer.releaseURL};
  }
  async download(filename){
    const offer=this.offer;if(!offer)throw new AppError('UPDATE_NONE');
    const response=await fetch(offer.file.url,{signal:AbortSignal.timeout(300000)});if(!response.ok||!response.body)throw new AppError('UPDATE_UNAVAILABLE');
    const temp=filename+'.'+randomUUID()+'.partial';const hash=createHash('sha256');let size=0;
    const handle=await fs.open(temp,'wx',0o600);
    try {
      for await(const chunk of response.body){size+=chunk.length;if(size>offer.file.size)throw new AppError('UPDATE_UNTRUSTED');hash.update(chunk);await handle.writeFile(chunk);}
      await handle.close();
      if(size!==offer.file.size||hash.digest('hex')!==offer.file.sha256)throw new AppError('UPDATE_UNTRUSTED');
      await fs.rename(temp,filename);return {name:path.basename(filename),verified:true};
    }catch(e){await handle.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});throw e;}
  }
}
module.exports={Updates,verifyManifest,newer,allowedURL};
