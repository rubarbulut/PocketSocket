'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {descriptors}=require('../app/lib/apps.cjs');
const {DEFAULTS}=require('../app/lib/store.cjs');
const {PROVIDERS}=require('../app/lib/connections.cjs');
const assert=require('node:assert/strict');
(async()=>{
  const candidates=[process.env.POCKET_CHROME_EXECUTABLE,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean);
  const executablePath=candidates.find(p=>fs.existsSync(p));
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  fs.mkdirSync('.build',{recursive:true});fs.mkdirSync('docs/images',{recursive:true});
  try{
    const page=await browser.newPage({viewport:{width:1080,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({defaults,apps,providers})=>{
      let state={phase:'idle',code:'READY',hasSession:false,connections:[],health:null};let settings={...defaults};let profiles=[];
      const snapshot=()=>({platform:'darwin',arch:'arm64',version:'0.2.0',locale:settings.language==='tr'?'tr':'en',settings,profiles,apps,state,storageAvailable:true,providers,memoryMB:65});
      const ok=value=>Promise.resolve({ok:true,value});
      window.pocket={
        initial:()=>ok(snapshot()),preferences:patch=>{Object.assign(settings,patch);return ok(snapshot())},
        importProfile:()=>{profiles.push({id:'example',name:'Example.conf',type:'wireguard',persisted:true});settings.activeProfile='example';return ok(snapshot())},
        removeProfile:id=>{profiles=profiles.filter(p=>p.id!==id);settings.activeProfile='';return ok(snapshot())},
        addProxy:input=>{profiles.push({id:'proxy',name:input.name,type:'socks5',persisted:true});settings.activeProfile='proxy';return ok(snapshot())},
        saveRecipe:name=>{settings.recipes.push({name,selected:[...settings.selected]});return ok(snapshot())},applyRecipe:()=>ok(snapshot()),deleteRecipe:()=>ok(snapshot()),
        resetPreferences:()=>{settings={...defaults,onboarding:true};return ok(snapshot())},external:()=>ok(null),visibility:()=>ok(null),report:()=>ok({saved:true}),
        checkUpdates:()=>ok({available:false}),onState:()=>{},onEvent:()=>{},onPanel:()=>{}
      };
    },{defaults:DEFAULTS,apps:descriptors([],'darwin').map(({id,title,browser})=>({id,title,browser})),providers:PROVIDERS.map(({id,name})=>({id,name}))});
    await page.goto(pathToFileURL(path.resolve('app/ui/index.html')).href);await page.locator('#welcome-start').click();
    assert.equal(await page.locator('#connect').isDisabled(),true);
    await page.screenshot({path:'docs/images/app-v2-en.png',fullPage:true});
    await page.locator('#quick-language').selectOption('tr');await page.waitForFunction(()=>document.getElementById('connect-label').textContent==='Bağlan');
    await page.screenshot({path:'docs/images/app-v2-tr.png',fullPage:true});
    await page.locator('#import').click();await page.waitForFunction(()=>!document.getElementById('connect').disabled);
    await page.locator('#app-search').fill('Chrome');await page.locator('#apps input').first().check();await page.waitForFunction(()=>!document.getElementById('browser-warning').classList.contains('hidden'));
    await page.locator('#app-search').fill('');
    await page.locator('[data-show="settings"]').click();await page.locator('#theme').selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.screenshot({path:'.build/settings-dark.png',fullPage:true});
    await page.locator('[data-show="help"]').click();assert((await page.locator('pre').textContent()).includes('com.apple.quarantine'));await page.screenshot({path:'.build/help.png',fullPage:true});
    await page.locator('[data-show="connect"]').click();await page.locator('#proxy-open').click();await page.locator('#proxy-form [type="submit"]').click();await page.waitForFunction(()=>!document.getElementById('proxy-dialog').open);
    await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Responsive layout overflows.');
    assert.deepEqual(errors,[]);
    await page.setContent('<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="24" y="24" width="976" height="976" rx="245" fill="#315e47"/><path d="M290 820V270h210c190 0 260 95 260 235S670 740 500 740H390v80Zm100-185h105c115 0 160-50 160-130s-45-130-160-130H390Z" fill="#d8ecaa"/></svg></body></html>');await page.setViewportSize({width:1024,height:1024});await page.screenshot({path:'app/ui/icon.png',omitBackground:true});
    await page.setContent('<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M6 27V7h9c7 0 11 4 11 9s-4 9-11 9h-5M10 13v6h5c3 0 5-1 5-3s-2-3-5-3Z" stroke="#263b2e" stroke-width="3" fill="none" stroke-linejoin="round"/></svg></body></html>');await page.setViewportSize({width:32,height:32});await page.screenshot({path:'app/ui/tray.png',omitBackground:true});
    console.log('Headless UI: EN/TR, onboarding, profiles, browser warning, dark theme, help, local proxy and responsive layout passed.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
