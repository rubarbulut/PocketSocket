'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { parseWireGuard } = require('./lib/wireguard.cjs');
const { PRESETS } = require('./lib/config.cjs');
const { Tunnel } = require('./lib/tunnel.cjs');
let window, tunnel, profile, profileName, quitting = false, quitPending = false;
const uiFile = path.join(__dirname, 'ui', 'index.html');
const uiURL = pathToFileURL(uiFile).href;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(() => {
    const core = app.isPackaged ? path.join(process.resourcesPath, 'core', 'mihomo') : path.join(__dirname, '..', 'vendor', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'mihomo.exe' : 'mihomo');
    tunnel = new Tunnel(core, state => { if (window && !window.isDestroyed()) window.webContents.send('state', state); });
    window = new BrowserWindow({
      width: 1010, height: 790, minWidth: 780, minHeight: 680,
      title: 'PocketSocket', backgroundColor: '#f6f5f1', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== uiURL) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, cb) => cb(false));
    const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiURL) throw new Error('İzinsiz istek.');
      try { return { ok: true, value: await fn(...args) }; }
      catch (e) { return { ok: false, error: e.message }; }
    });
    handle('initial', () => ({ platform: process.platform, version: app.getVersion(), presets: Object.entries(PRESETS).map(([id, p]) => ({ id, title: p.title })), state: tunnel.state, profileName }));
    handle('import-profile', async () => {
      if (tunnel.session) throw new Error('Profili değiştirmeden önce bağlantıyı kes.');
      const result = await dialog.showOpenDialog(window, { title: 'WireGuard profili seç', properties: ['openFile'], filters: [{ name: 'WireGuard', extensions: ['conf'] }] });
      if (result.canceled) return null;
      const filename = result.filePaths[0];
      if ((await fs.stat(filename)).size > 65536) throw new Error('Dosya en fazla 64 KB olabilir.');
      const next = parseWireGuard(await fs.readFile(filename, 'utf8'));
      profile = next;
      profileName = path.basename(filename);
      return { name: profileName, server: next.server, ipv6: Boolean(next.ipv6) };
    });
    handle('forget-profile', () => {
      if (tunnel.session) throw new Error('Önce bağlantıyı kes.');
      profile = undefined; profileName = undefined;
    });
    handle('connect', async selected => {
      if (!profile) throw new Error('Önce kendi WireGuard profilini içe aktar.');
      await tunnel.connect(profile, selected);
    });
    handle('disconnect', () => tunnel.disconnect());
    window.loadFile(uiFile);
    window.on('closed', () => { window = null; app.quit(); });
  });
  app.on('before-quit', event => {
    if (quitting || !tunnel?.session) return;
    event.preventDefault();
    if (quitPending) return;
    quitPending = true;
    tunnel.disconnect().finally(() => { quitting = true; app.quit(); });
  });
  app.on('window-all-closed', () => app.quit());
}
