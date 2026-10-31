'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pocket', {
  initial: () => ipcRenderer.invoke('initial'),
  importProfile: () => ipcRenderer.invoke('import-profile'),
  forgetProfile: () => ipcRenderer.invoke('forget-profile'),
  connect: ids => ipcRenderer.invoke('connect', ids),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  onState: callback => { ipcRenderer.on('state', (_event, state) => callback(state)); }
});
