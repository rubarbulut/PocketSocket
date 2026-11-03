'use strict';
const $=id=>document.getElementById(id);
let model,locale='en',uiBusy=false,currentPanel='connect',discovered=[],toastTimer,initialized=false;
const tr=(key,values)=>PocketI18n.t(locale,key,values);
function toast(code,values){$('toast').textContent=tr(code,values);$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6500);}
async function call(operation){try{const r=await operation();if(!r.ok)throw new Error(r.error);return r.value}catch(e){toast(e.message||'INTERNAL_ERROR');return undefined}}
function element(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function translation(){
  document.documentElement.lang=locale;
  document.querySelectorAll('[data-t]').forEach(n=>n.textContent=tr(n.dataset.t));
  document.querySelectorAll('[data-placeholder]').forEach(n=>n.placeholder=tr(n.dataset.placeholder));
}
function locks(){
  if(!model)return;
  const state=model.state,busy=uiBusy||['connecting','disconnecting'].includes(state.phase),locked=busy||state.hasSession;
  document.querySelectorAll('[data-lock]').forEach(n=>n.disabled=locked);
  document.querySelectorAll('#apps input,#apps .remove-app').forEach(n=>n.disabled=locked||model.settings.mode==='dns');
  $('connect').disabled=busy||(!state.hasSession&&model.settings.mode==='tunnel'&&(!model.settings.activeProfile||!model.settings.selected.length));
  $('connect-label').textContent=state.hasSession?tr('disconnect'):tr('connect');
  if(busy)$('connect-label').textContent=tr(state.phase==='disconnecting'?'STOPPING':'PREPARING');
  $('profile-delete').disabled=locked||!model.settings.activeProfile;
  $('profile-controls').classList.toggle('hidden',model.settings.mode==='dns');
}
function showPanel(panel){currentPanel=panel;for(const name of ['connect','settings','help'])$('panel-'+name).classList.toggle('hidden',name!==panel);document.querySelectorAll('[data-show]').forEach(b=>b.classList.toggle('active',b.dataset.show===panel));window.scrollTo(0,0);}
function renderApps(){
  const term=$('app-search').value.toLowerCase(),chosen=new Set(model.settings.selected);
  $('apps').replaceChildren();
  for(const app of model.apps.filter(a=>a.title.toLowerCase().includes(term))){
    const label=element('label',undefined,'app-choice'),input=element('input');input.type='checkbox';input.value=app.id;input.checked=chosen.has(app.id);input.setAttribute('aria-label',app.title);
    input.addEventListener('change',()=>{const ids=new Set(model.settings.selected);input.checked?ids.add(app.id):ids.delete(app.id);preferences({selected:[...ids]});});
    label.append(input,element('span',app.title[0],'app-avatar'),element('span',app.title));
    if(app.custom){const remove=element('button','×','remove-app');remove.type='button';remove.setAttribute('aria-label',tr('forget')+' '+app.title);remove.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const result=await call(()=>window.pocket.removeApp(app.id));if(result)render(result)});label.append(remove);}
    $('apps').append(label);
  }
  $('browser-warning').classList.toggle('hidden',!model.apps.some(a=>a.browser&&chosen.has(a.id)));
  $('selected-count').textContent=tr('appCount',{count:chosen.size});
  $('route-apps').textContent=model.settings.mode==='dns'?tr('dnsMode'):model.apps.filter(a=>chosen.has(a.id)).map(a=>a.title).join(', ')||tr('selectApps');
  $('route-target').textContent=tr(model.settings.mode==='dns'?'direct':'tunnel');
  locks();
}
function renderRecipes(){
  $('recipe-list').replaceChildren();
  for(const recipe of model.settings.recipes){const row=element('div',undefined,'recipe-item');row.append(element('span',recipe.name));const actions=element('div',undefined,'inline');for(const [key,method]of [['applyRecipe','applyRecipe'],['deleteRecipe','deleteRecipe']]){const b=element('button',tr(key));b.dataset.lock='';b.onclick=async()=>{const next=await call(()=>window.pocket[method](recipe.name));if(next)render(next)};actions.append(b)}row.append(actions);$('recipe-list').append(row)}
}
function renderState(state){
  if(!model)return;model.state=state;
  const warning=['OUTBOUND_UNREACHABLE','DIRECT_FALLBACK','DISCORD_UNREACHABLE','DNS_UNVERIFIED'].includes(state.code);
  $('status').className='status '+state.phase+(warning?' warning':'');$('message').textContent=tr(state.code);
  const rows=state.connections||[];$('connections').replaceChildren();
  for(const row of rows){const r=element('tr');for(const value of [row.app,row.destination,row.network,tr(row.route)])r.append(element('td',value));$('connections').append(r)}
  $('connection-count').textContent=tr('connectionCount',{count:rows.length});$('empty').classList.toggle('hidden',!!rows.length);
  if(state.health)renderHealth(state.health);else $('health-results').classList.add('hidden');locks();
}
function renderHealth(health){
  $('health-results').classList.remove('hidden');$('health-grid').replaceChildren();
  for(const [key,value,time]of [['directLatency',health.directMs,true],['tunnelLatency',health.tunnelMs,true],['outbound',health.outbound],['discord',health.discord],['udpStatus',health.udpObserved?true:null]]){
    const card=element('div',undefined,'health-item');card.append(element('span',tr(key)),element('strong',time?(Number.isFinite(value)?value+' ms':'—'):tr(value===true?'passed':value===false?'failed':'untested')));$('health-grid').append(card);
  }
}
function render(next){
  model=next;locale=model.locale;document.documentElement.dataset.theme=model.settings.theme;translation();
  $('platform').textContent=(model.platform==='darwin'?'macOS':model.platform==='win32'?'Windows':'Linux')+' · '+model.arch;
  $('version').textContent='PocketSocket '+model.version;$('resources').textContent=tr('resources')+': '+model.memoryMB+' MB';
  for(const id of ['mode','resolver','language','theme','failurePolicy','channel'])$(id).value=model.settings[id];
  $('quick-language').value=model.settings.language;
  for(const id of ['remember','reconnect','launchAtLogin','autoConnect','closeToTray','notifications'])$(id).checked=model.settings[id];
  $('login-setting').classList.toggle('hidden',model.platform==='linux');
  $('profile-select').replaceChildren();const empty=element('option',tr('noProfile'));empty.value='';$('profile-select').append(empty);
  for(const p of model.profiles){const option=element('option',p.name+' · '+(p.type==='wireguard'?'WireGuard':'SOCKS5'));option.value=p.id;$('profile-select').append(option)}$('profile-select').value=model.settings.activeProfile;
  const active=model.profiles.find(p=>p.id===model.settings.activeProfile);$('storage-note').textContent=active?tr(active.persisted?'saved':'sessionOnly'):'';
  $('provider-links').replaceChildren();for(const provider of model.providers){const b=element('button',provider.name,'text-button');b.onclick=()=>call(()=>window.pocket.external(provider.id));$('provider-links').append(b)}
  renderApps();renderRecipes();renderState(model.state);
  if(!initialized){initialized=true;if(!model.settings.onboarding)$('welcome').showModal();}
}
async function preferences(patch){const next=await call(()=>window.pocket.preferences(patch));if(next)render(next);else if(model)render(model)}
for(const button of document.querySelectorAll('[data-show]'))button.onclick=()=>showPanel(button.dataset.show);
for(const button of document.querySelectorAll('[data-dismiss]'))button.onclick=()=>$(button.dataset.dismiss).close();
for(const button of document.querySelectorAll('[data-external]'))button.onclick=()=>call(()=>window.pocket.external(button.dataset.external));
$('quick-language').onchange=()=>preferences({language:$('quick-language').value});
for(const id of ['mode','resolver','language','theme','failurePolicy','channel'])$(id).onchange=()=>preferences({[id]:$(id).value});
for(const id of ['remember','reconnect','launchAtLogin','autoConnect','closeToTray','notifications'])$(id).onchange=()=>preferences({[id]:$(id).checked});
$('profile-select').onchange=()=>preferences({activeProfile:$('profile-select').value});
$('app-search').oninput=renderApps;
$('import').onclick=async()=>{const next=await call(()=>window.pocket.importProfile());if(next){render(next);toast('PROFILE_ADDED')}};
$('profile-delete').onclick=async()=>{const next=await call(()=>window.pocket.removeProfile(model.settings.activeProfile));if(next){render(next);toast('PROFILE_REMOVED')}};
$('proxy-open').onclick=()=>$('proxy-dialog').showModal();
$('proxy-form').onsubmit=async e=>{e.preventDefault();const formElement=e.currentTarget,form=new FormData(formElement);const input=Object.fromEntries(form);input.port=Number(input.port);input.udp=form.has('udp');const next=await call(()=>window.pocket.addProxy(input));if(next){formElement.reset();$('proxy-dialog').close();render(next);toast('PROFILE_ADDED')}};
$('providers-open').onclick=()=>showPanel('help');
$('choose-app').onclick=async()=>{const next=await call(()=>window.pocket.chooseApp());if(next)render(next)};
function renderDiscovered(){const term=$('discovered-search').value.toLowerCase();$('discovered-list').replaceChildren();for(const app of discovered.filter(a=>a.title.toLowerCase().includes(term))){const b=element('button',app.title+(app.browser?' · '+tr('browserWarning'):''));b.onclick=async()=>{const next=await call(()=>window.pocket.addDiscoveredApp(app.id));if(next){$('discover-dialog').close();render(next)}};$('discovered-list').append(b)}}
$('discover').onclick=async()=>{const button=$('discover');button.disabled=true;const found=await call(()=>window.pocket.discoverApps());button.disabled=false;if(found){discovered=found;renderDiscovered();$('discover-dialog').showModal()}};
$('discovered-search').oninput=renderDiscovered;
$('recipe-save').onclick=async()=>{const next=await call(()=>window.pocket.saveRecipe($('recipe-name').value));if(next){$('recipe-name').value='';render(next)}};
$('connect').onclick=async()=>{if(uiBusy)return;uiBusy=true;locks();const next=await call(()=>model.state.hasSession?window.pocket.disconnect():window.pocket.connect());uiBusy=false;if(next)render(next);else{const fresh=await call(()=>window.pocket.initial());if(fresh)render(fresh)}locks()};
$('health').onclick=async()=>{const button=$('health');button.disabled=true;const result=await call(()=>window.pocket.health());button.disabled=false;if(result?.kind==='session')renderHealth(result.health||{});if(result?.kind==='preflight')renderHealth({directMs:result.direct.ms,discord:result.direct.ok,outbound:null,tunnelMs:null})};
$('report').onclick=async()=>{if(await call(()=>window.pocket.report()))toast('REPORT_SAVED')};
$('reset').onclick=async()=>{const next=await call(()=>window.pocket.resetPreferences());if(next)render(next)};
$('welcome-start').onclick=async()=>{await preferences({onboarding:true});$('welcome').close()};
$('updates-check').onclick=async()=>{const button=$('updates-check');button.disabled=true;const result=await call(()=>window.pocket.checkUpdates());button.disabled=false;if(result){$('update-message').textContent=tr(result.available?'updateFound':'updateNone',{version:result.version});$('updates-download').classList.toggle('hidden',!result.available)}};
$('updates-download').onclick=async()=>{const button=$('updates-download');button.disabled=true;const result=await call(()=>window.pocket.downloadUpdate());button.disabled=false;if(result){$('update-message').textContent=tr('updateSaved');button.classList.add('hidden')}};
for(const type of ['dragenter','dragover'])$('import').addEventListener(type,e=>{e.preventDefault();if(!$('import').disabled)$('import').classList.add('drag')});
$('import').addEventListener('dragleave',()=>$('import').classList.remove('drag'));
$('import').addEventListener('drop',async e=>{e.preventDefault();$('import').classList.remove('drag');if($('import').disabled)return;const file=e.dataTransfer.files[0];if(file){const next=await call(()=>window.pocket.importDropped(file));if(next)render(next)}});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>window.pocket.visibility(!document.hidden));
window.pocket.onState(renderState);
window.pocket.onEvent(async event=>{toast(event.code);const next=await call(()=>window.pocket.initial());if(next)render(next)});
window.pocket.onPanel(showPanel);
(async()=>{const initial=await call(()=>window.pocket.initial());if(initial)render(initial)})();
