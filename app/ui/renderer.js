'use strict';
const $ = id => document.getElementById(id);
let hasProfile = false, platform, phase = 'idle', hasSession = false;
function selected() { return [...document.querySelectorAll('#apps input:checked')].map(i => i.value); }
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function refresh() {
  const ids = selected();
  const busy = phase === 'connecting' || phase === 'disconnecting';
  $('connect').disabled = busy || (!hasSession && (platform !== 'darwin' || !hasProfile || !ids.length));
  $('connect-label').textContent = phase === 'connecting' ? 'Bağlanıyor…' : phase === 'disconnecting' ? 'Kapatılıyor…' : hasSession ? 'Bağlantıyı kes' : 'Bağlan';
  $('import').disabled = hasSession || busy;
  $('forget').disabled = hasSession || busy;
  document.querySelectorAll('#apps input').forEach(input => { input.disabled = hasSession || busy; });
  $('route-apps').textContent = ids.length ? [...document.querySelectorAll('#apps input:checked')].map(i => i.dataset.title).join(', ') : 'Uygulama seçilmedi';
  $('status-label').textContent = phase === 'connected' ? 'Yönlendirme etkin' : busy ? 'İşlem sürüyor' : phase === 'error' ? 'Kontrol gerekiyor' : 'Tünel kapalı';
  $('status').className = 'status ' + (phase === 'connected' ? 'active' : busy ? 'busy' : phase === 'error' ? 'error' : '');
}
function applyState(state) {
  phase = state.phase;
  // A failed shutdown may still have a live session; permit another disconnect attempt.
  hasSession = state.hasSession ?? ['connected', 'connecting', 'disconnecting'].includes(phase);
  message(state.message, phase === 'error');
  const rows = state.connections || [];
  $('connections').replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const text of [row.app, row.destination, row.network, row.route]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    $('connections').append(tr);
  }
  $('connection-count').textContent = `${rows.length} bağlantı`;
  $('empty').classList.toggle('hidden', rows.length > 0);
  refresh();
}
async function call(operation) {
  try {
    const result = await operation();
    if (!result.ok) throw new Error(result.error);
    return result.value;
  } catch (e) { message(e.message || 'İşlem tamamlanamadı.', true); return undefined; }
}
$('import').addEventListener('click', async () => {
  const profile = await call(() => window.pocket.importProfile());
  if (!profile) return;
  hasProfile = true;
  $('profile-title').textContent = profile.name;
  $('profile-subtitle').textContent = profile.server;
  $('forget').classList.remove('hidden');
  message(profile.ipv6 ? 'Profil hazır. Bağlanıp Discord’u yeniden açabilirsin.' : 'Profil hazır. Bu IPv4 profilinde bağlantı süresince IPv6 DNS yanıtları kapatılır.');
  refresh();
});
$('forget').addEventListener('click', async () => {
  const result = await window.pocket.forgetProfile();
  if (!result.ok) { message(result.error, true); return; }
  hasProfile = false;
  $('profile-title').textContent = 'WireGuard dosyasını seç';
  $('profile-subtitle').textContent = 'VPN sağlayıcından aldığın .conf dosyası';
  $('forget').classList.add('hidden');
  message('Profil bu oturumdan kaldırıldı.');
  refresh();
});
$('connect').addEventListener('click', async () => {
  // Disable synchronously before IPC returns so double-clicks cannot start two sessions.
  const stopping = hasSession;
  phase = stopping ? 'disconnecting' : 'connecting';
  refresh();
  await call(() => stopping ? window.pocket.disconnect() : window.pocket.connect(selected()));
  const initial = await call(() => window.pocket.initial());
  if (initial) applyState(initial.state);
});
window.pocket.onState(applyState);
(async () => {
  const initial = await call(() => window.pocket.initial());
  if (!initial) return;
  platform = initial.platform;
  $('version').textContent = `PocketSocket ${initial.version}`;
  $('platform-warning').classList.toggle('hidden', platform === 'darwin');
  for (const preset of initial.presets) {
    const label = document.createElement('label');
    label.className = 'app-choice';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = preset.id; input.dataset.title = preset.title;
    input.checked = preset.id === 'discord';
    input.addEventListener('change', refresh);
    label.append(input, document.createTextNode(preset.title));
    $('apps').append(label);
  }
  applyState(initial.state);
})();
