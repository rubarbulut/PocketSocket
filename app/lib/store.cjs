'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AppError } = require('./errors.cjs');
const DEFAULTS = Object.freeze({ language: 'auto', theme: 'system', mode: 'tunnel', resolver: 'cloudflare', remember: true, reconnect: true, launchAtLogin: false, autoConnect: false, closeToTray: false, notifications: false, channel: 'stable', failurePolicy: 'block', selected: ['discord'], activeProfile: '', customApps: [], recipes: [], onboarding: false });
function settings(input = {}) {
  const result = { ...DEFAULTS };
  for (const [key, choices] of Object.entries({ language: ['auto','en','tr'], theme: ['system','light','dark'], mode: ['auto','tunnel','dns'], resolver: ['cloudflare','google','quad9'], channel: ['stable','beta'], failurePolicy: ['block','direct'] })) if (choices.includes(input[key])) result[key] = input[key];
  for (const key of ['remember','reconnect','launchAtLogin','autoConnect','closeToTray','notifications','onboarding']) if (typeof input[key] === 'boolean') result[key] = input[key];
  if (Array.isArray(input.selected)) result.selected = input.selected.filter(v=>typeof v==='string' && /^[a-z0-9:_-]{1,100}$/.test(v)).slice(0,50);
  if (typeof input.activeProfile === 'string') result.activeProfile = input.activeProfile.slice(0,100);
  if (Array.isArray(input.customApps)) result.customApps = input.customApps.filter(a => a && /^app:[a-f0-9]{20}$/.test(a.id) && typeof a.path === 'string' && typeof a.title === 'string').slice(0,100);
  if (Array.isArray(input.recipes)) result.recipes = input.recipes.filter(r => r && typeof r.name === 'string' && Array.isArray(r.selected)).slice(0,20).map(r=>({name:r.name.slice(0,60),selected:r.selected.filter(s=>typeof s==='string' && /^[a-z0-9:_-]{1,100}$/.test(s)).slice(0,50)}));
  return result;
}
class Store {
  constructor(directory, crypto) { this.directory=directory; this.crypto=crypto; this.data={version:1,settings:settings(),profiles:[]}; this.session=new Map(); this.queue=Promise.resolve(); this.unavailable=false; }
  async load() {
    try {
      const raw=JSON.parse(await fs.readFile(path.join(this.directory,'settings.json'),'utf8'));
      this.data={version:1,settings:settings(raw.settings),profiles:Array.isArray(raw.profiles)?raw.profiles.filter(p=>p && typeof p.id==='string' && typeof p.ciphertext==='string' && typeof p.name==='string' && ['wireguard','socks5'].includes(p.type)).slice(0,30):[]};
    } catch(e) { if(e.code!=='ENOENT') this.unavailable=true; }
    return this;
  }
  async available() {
    if (this.crypto.getSelectedStorageBackend?.()==='basic_text') return false;
    const available=this.crypto.isAsyncEncryptionAvailable ? await this.crypto.isAsyncEncryptionAvailable() : this.crypto.isEncryptionAvailable();
    return !!available&&this.crypto.getSelectedStorageBackend?.()!=='basic_text';
  }
  async encrypt(value) { return this.crypto.encryptStringAsync ? this.crypto.encryptStringAsync(value) : this.crypto.encryptString(value); }
  async decrypt(value) {
    if(!this.crypto.decryptStringAsync) return this.crypto.decryptString(value);
    let result=await this.crypto.decryptStringAsync(value);
    if(result.shouldReEncrypt) result=await this.crypto.decryptStringAsync(value);
    return result.result;
  }
  async write() {
    const payload=JSON.stringify(this.data,null,2);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      const filename=path.join(this.directory,`settings-${randomUUID()}.tmp`);
      await fs.writeFile(filename,payload,{mode:0o600});
      await fs.rename(filename,path.join(this.directory,'settings.json'));
    });
    return this.queue;
  }
  async update(patch) { this.data.settings=settings({...this.data.settings,...patch}); await this.write(); return this.data.settings; }
  list() {
    const result=this.data.profiles.map(({id,name,type})=>({id,name,type,persisted:true}));
    for(const [id,p] of this.session) if(!result.some(r=>r.id===id)) result.push({id,name:p.name,type:p.profile.type,persisted:false});
    return result;
  }
  async add(name,profile,remember) {
    if(this.list().length>=30) throw new AppError('PROFILE_LIMIT');
    const id=randomUUID(); name=String(name).slice(0,80);
    let persisted=false;
    if(remember && await this.available()) {
      const ciphertext=(await this.encrypt(JSON.stringify(profile))).toString('base64');
      this.data.profiles.push({id,name,type:profile.type,ciphertext}); persisted=true;
    }
    this.session.set(id,{name,profile:structuredClone(profile)});
    this.data.settings.activeProfile=id;
    await this.write();
    return {id,name,type:profile.type,persisted};
  }
  async get(id) {
    if(this.session.has(id)) return structuredClone(this.session.get(id).profile);
    const saved=this.data.profiles.find(p=>p.id===id);
    if(!saved) throw new AppError('PROFILE_REQUIRED');
    try {
      if(!await this.available()) throw new Error('Unavailable');
      const profile=JSON.parse(await this.decrypt(Buffer.from(saved.ciphertext,'base64')));
      if(!['wireguard','socks5'].includes(profile.type)) throw new Error('Invalid');
      this.session.set(id,{name:saved.name,profile}); return structuredClone(profile);
    } catch { throw new AppError('PROFILE_LOCKED'); }
  }
  async remove(id) { this.session.delete(id); this.data.profiles=this.data.profiles.filter(p=>p.id!==id); if(this.data.settings.activeProfile===id) this.data.settings.activeProfile=this.list()[0]?.id||''; await this.write(); }
}
module.exports={Store,DEFAULTS,settings};
