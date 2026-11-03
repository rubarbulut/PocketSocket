'use strict';
const {app,BrowserWindow,ipcMain,dialog,safeStorage,Tray,Menu,nativeImage,shell,powerMonitor,Notification}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Store,DEFAULTS}=require('./lib/store.cjs');
const {parseWireGuard}=require('./lib/wireguard.cjs');
const {Tunnel}=require('./lib/tunnel.cjs');
const {descriptors,appDescriptor,discover,ruleMatches}=require('./lib/apps.cjs');
const {localProxy,PROVIDERS}=require('./lib/connections.cjs');
const {directCheck,dnsCheck,networkSignature,supportReport}=require('./lib/diagnostics.cjs');
const {Updates}=require('./lib/updates.cjs');
const {AppError}=require('./lib/errors.cjs');
const {t}=require('./ui/i18n.js');
const UI=path.join(__dirname,'ui','index.html'),UI_URL=pathToFileURL(UI).href;
let window,tray,store,tunnel,updates,quitting=false,quitPending=false,networkTimer,knownNetwork='',scanned=new Map(),pendingFiles=[];
let cryptoAvailable=false,lastNotice='',eventCodes=[];
if(process.env.CI==='true'&&process.env.POCKET_TEST_DIR)app.setPath('userData',process.env.POCKET_TEST_DIR);
const language=()=>store?.data.settings.language==='auto'?(app.getLocale().toLowerCase().startsWith('tr')?'tr':'en'):(store?.data.settings.language||'en');
const text=(key,values)=>t(language(),key,values);
const mutable=()=>{if(tunnel?.session||tunnel?.pending)throw new AppError('BUSY')};
function emitEvent(code){eventCodes.push(code);eventCodes=eventCodes.slice(-15);if(window&&!window.isDestroyed())window.webContents.send('event',{code});}
function snapshot(){return {platform:process.platform,arch:process.arch,version:app.getVersion(),locale:language(),settings:store.data.settings,profiles:store.list(),apps:descriptors(store.data.settings.customApps).map(({id,title,browser,custom})=>({id,title,browser:!!browser,custom:!!custom})),state:tunnel.state,storageAvailable:cryptoAvailable,storageWarning:store.unavailable,providers:PROVIDERS.map(({id,name})=>({id,name})),memoryMB:Math.round(process.memoryUsage().rss/1048576)};}
function show(){if(!window||window.isDestroyed())return;window.show();window.focus();}
function menu(){
  if(!tray)return;
  tray.setToolTip(`PocketSocket — ${text(tunnel.state.code)}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'PocketSocket',click:show},
    {label:text(tunnel.session?'disconnect':'connect'),enabled:!tunnel.pending&&tunnel.state.phase!=='disconnecting',click:()=>{(tunnel.session?tunnel.disconnect():connect()).catch(e=>emitEvent(e.code||'INTERNAL_ERROR'));}},
    {type:'separator'},{label:text('settings'),click:()=>{show();window.webContents.send('open-panel','settings');}},
    {label:language()==='tr'?'Çıkış':'Quit',click:()=>app.quit()}
  ]));
}
function onState(state){
  if(window&&!window.isDestroyed())window.webContents.send('state',state);
  menu();
  if(store?.data.settings.notifications&&['RECONNECT_REQUIRED','OUTBOUND_UNREACHABLE'].includes(state.code)&&state.code!==lastNotice&&Notification.isSupported())new Notification({title:'PocketSocket',body:text(state.code)}).show();
  lastNotice=state.code;
}
async function connect(){
  const p=store.data.settings;
  const profile=p.mode!=='dns'&&p.activeProfile?await store.get(p.activeProfile):null;
  await tunnel.connect(profile,p.selected,{...p});
}
async function importFile(filename){
  mutable();
  if(typeof filename!=='string'||!filename.toLowerCase().endsWith('.conf'))throw new AppError('PROFILE_INVALID');
  const stat=await fs.stat(filename);if(!stat.isFile()||stat.size>65536)throw new AppError('PROFILE_INVALID');
  let profile;try{profile=parseWireGuard(await fs.readFile(filename,'utf8'))}catch{throw new AppError('PROFILE_INVALID')}
  const result=await store.add(path.basename(filename),profile,store.data.settings.remember);menu();return result;
}
async function addApp(descriptor){
  mutable();const custom=store.data.settings.customApps.filter(a=>a.id!==descriptor.id);custom.push(descriptor);
  await store.update({customApps:custom,selected:[...new Set([...store.data.settings.selected,descriptor.id])]});return snapshot();
}
function external(id){
  const links={issues:'https://github.com/rubarbulut/PocketSocket/issues',source:'https://github.com/rubarbulut/PocketSocket',releases:'https://github.com/rubarbulut/PocketSocket/releases',apple:'https://support.apple.com/en-us/102445',download:'https://rubarbulut.github.io/PocketSocket/'};
  const url=links[id]||PROVIDERS.find(p=>p.id===id)?.url;if(!url)throw new AppError('INTERNAL_ERROR');return shell.openExternal(url);
}
function handle(channel,operation){ipcMain.handle(channel,async(event,...args)=>{
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==UI_URL)throw new Error('Unauthorized IPC');
  try{return {ok:true,value:await operation(...args)}}catch(e){const code=e.code&&/^[A-Z_]+$/.test(e.code)&&!['ENOENT','EACCES','EPERM'].includes(e.code)?e.code:'INTERNAL_ERROR';eventCodes.push(code);return {ok:false,error:code}}
});}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('open-file',(event,filename)=>{event.preventDefault();if(store)importFile(filename).then(()=>emitEvent('PROFILE_ADDED')).catch(e=>emitEvent(e.code||'PROFILE_INVALID'));else pendingFiles.push(filename);});
  app.on('second-instance',(_event,args)=>{const filename=args.find(a=>a.toLowerCase().endsWith('.conf'));if(filename)importFile(filename).then(()=>emitEvent('PROFILE_ADDED')).catch(e=>emitEvent(e.code||'PROFILE_INVALID'));show();});
  app.whenReady().then(async()=>{
    store=await new Store(app.getPath('userData'),safeStorage).load();
    try{cryptoAvailable=await store.available()}catch{}
    const core=app.isPackaged?path.join(process.resourcesPath,'core',process.platform==='win32'?'mihomo.exe':'mihomo'):path.join(__dirname,'..','vendor',`${process.platform}-${process.arch}`,process.platform==='win32'?'mihomo.exe':'mihomo');
    const helper=process.platform==='win32'?'supervisor.ps1':process.platform==='linux'?'supervisor-linux.sh':'supervisor.sh';
    const supervisor=app.isPackaged?path.join(process.resourcesPath,'helpers',helper):path.join(__dirname,helper);
    tunnel=new Tunnel(core,onState,supervisor);
    updates=new Updates(app.getVersion(),await fs.readFile(path.join(__dirname,'update-key.pem'),'utf8'));
    window=new BrowserWindow({width:1080,height:860,minWidth:740,minHeight:600,title:'PocketSocket',backgroundColor:'#f6f5f1',autoHideMenuBar:true,show:!process.argv.includes('--hidden'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(url!==UI_URL)event.preventDefault()});
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,cb)=>cb(false));
    handle('initial',()=>snapshot());
    handle('import-profile',async()=>{mutable();const result=await dialog.showOpenDialog(window,{title:text('import'),properties:['openFile'],filters:[{name:'WireGuard',extensions:['conf']}]});if(result.canceled)return null;await importFile(result.filePaths[0]);return snapshot();});
    handle('import-path',async filename=>{await importFile(filename);return snapshot()});
    handle('proxy-add',async input=>{mutable();const profile=localProxy(input);await store.add(String(input.name||'Local SOCKS5'),profile,store.data.settings.remember);return snapshot()});
    handle('profile-remove',async id=>{mutable();await store.remove(id);return snapshot()});
    handle('preferences',async patch=>{
      if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new AppError('INTERNAL_ERROR');
      const allowed=['language','theme','mode','resolver','remember','reconnect','launchAtLogin','autoConnect','closeToTray','notifications','channel','failurePolicy','selected','activeProfile','onboarding'];
      if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new AppError('INTERNAL_ERROR');
      if(Object.keys(patch).some(k=>!['language','theme','notifications','closeToTray'].includes(k)))mutable();
      if(patch.selected?.length)ruleMatches(patch.selected,store.data.settings.customApps);
      if(patch.activeProfile&&!store.list().some(p=>p.id===patch.activeProfile))throw new AppError('PROFILE_REQUIRED');
      await store.update(patch);
      if(Object.hasOwn(patch,'launchAtLogin')&&['darwin','win32'].includes(process.platform))app.setLoginItemSettings({openAtLogin:store.data.settings.launchAtLogin,args:['--hidden']});
      menu();return snapshot();
    });
    handle('reset-preferences',async()=>{mutable();await store.update({...DEFAULTS,activeProfile:store.list()[0]?.id||'',onboarding:true});if(['darwin','win32'].includes(process.platform))app.setLoginItemSettings({openAtLogin:false});return snapshot()});
    handle('apps-discover',async()=>{mutable();const found=await discover();scanned=new Map(found.map(a=>[a.id,a]));return found.map(({id,title,browser})=>({id,title,browser}))});
    handle('apps-add-discovered',async id=>{const app=scanned.get(id);if(!app)throw new AppError('APP_INVALID');return addApp(await appDescriptor(app.path))});
    handle('apps-choose',async()=>{mutable();const result=await dialog.showOpenDialog(window,{title:text('chooseApp'),properties:process.platform==='darwin'?['openFile','openDirectory']:['openFile'],...(process.platform==='win32'?{filters:[{name:'Application',extensions:['exe']}]}:{})});if(result.canceled)return null;return addApp(await appDescriptor(result.filePaths[0]))});
    handle('apps-remove',async id=>{mutable();await store.update({customApps:store.data.settings.customApps.filter(a=>a.id!==id),selected:store.data.settings.selected.filter(a=>a!==id)});return snapshot()});
    handle('recipe-save',async name=>{mutable();if(typeof name!=='string'||!name.trim())throw new AppError('APP_INVALID');const recipes=store.data.settings.recipes.filter(r=>r.name!==name.trim());recipes.push({name:name.trim().slice(0,60),selected:store.data.settings.selected});await store.update({recipes});return snapshot()});
    handle('recipe-apply',async name=>{mutable();const recipe=store.data.settings.recipes.find(r=>r.name===name);if(!recipe)throw new AppError('APP_INVALID');const ids=new Set(descriptors(store.data.settings.customApps).map(a=>a.id));await store.update({selected:recipe.selected.filter(id=>ids.has(id))});return snapshot()});
    handle('recipe-delete',async name=>{mutable();await store.update({recipes:store.data.settings.recipes.filter(r=>r.name!==name)});return snapshot()});
    handle('connect',async()=>{await connect();return snapshot()});
    handle('disconnect',async()=>{await tunnel.disconnect();return snapshot()});
    handle('health',async()=>tunnel.session?{kind:'session',health:await tunnel.checkHealth()}:{kind:'preflight',direct:await directCheck(),dns:await dnsCheck()});
    handle('report',async()=>{const result=await dialog.showSaveDialog(window,{title:text('report'),defaultPath:'PocketSocket-support.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return null;const report=supportReport({version:app.getVersion(),platform:process.platform,arch:process.arch,state:tunnel.state,settings:store.data.settings,profileCount:store.list().length,storageAvailable:cryptoAvailable});report.events=eventCodes.filter(c=>/^[A-Z_]+$/.test(c)).slice(-15);await fs.writeFile(result.filePath,JSON.stringify(report,null,2),{mode:0o600});return {saved:true}});
    handle('updates-check',()=>updates.check(store.data.settings.channel));
    handle('updates-download',async()=>{if(!updates.offer)throw new AppError('UPDATE_NONE');const result=await dialog.showSaveDialog(window,{title:text('downloadUpdate'),defaultPath:path.join(app.getPath('downloads'),updates.offer.file.name)});return result.canceled?null:updates.download(result.filePath)});
    handle('external',external);
    handle('visibility',visible=>{tunnel.visible=!!visible;return null});
    window.on('close',event=>{if(!quitting&&store.data.settings.closeToTray&&tray){event.preventDefault();window.hide();tunnel.visible=false}});
    window.on('show',()=>{tunnel.visible=true});window.on('hide',()=>{tunnel.visible=false});
    window.on('closed',()=>{window=null;app.quit()});
    try{let icon=nativeImage.createFromPath(path.join(__dirname,'ui','tray.png'));if(process.platform==='darwin')icon.setTemplateImage(true);tray=new Tray(icon.resize({width:18,height:18}));tray.on('click',show);menu()}catch{}
    if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'},{role:'windowMenu'}]));
    await window.loadFile(UI);
    for(const filename of [...pendingFiles,...process.argv.filter(a=>a.toLowerCase().endsWith('.conf'))])try{await importFile(filename);emitEvent('PROFILE_ADDED')}catch(e){emitEvent(e.code||'PROFILE_INVALID')}
    pendingFiles=[];
    knownNetwork=networkSignature();
    networkTimer=setInterval(()=>{const signature=networkSignature();if(signature!==knownNetwork){knownNetwork=signature;if(tunnel.session&&store.data.settings.reconnect)tunnel.checkHealth().catch(()=>{})}},10000);
    powerMonitor.on('resume',()=>{if(tunnel.session)tunnel.checkHealth().catch(()=>{})});
    if(store.data.settings.autoConnect&&store.data.settings.onboarding&&!process.env.CI)connect().catch(e=>emitEvent(e.code||'START_FAILED'));
  }).catch(()=>{dialog.showErrorBox('PocketSocket','Startup failed. Reinstall PocketSocket and check your local settings folder.');app.quit()});
  app.on('before-quit',event=>{
    if(quitting)return;
    if(tunnel?.session||tunnel?.pending){event.preventDefault();if(quitPending)return;quitPending=true;tunnel.disconnect().finally(()=>{quitting=true;clearInterval(networkTimer);tray?.destroy();app.quit()})}
    else{quitting=true;clearInterval(networkTimer);tray?.destroy()}
  });
  app.on('window-all-closed',()=>app.quit());
}
