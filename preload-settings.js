const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSettings:   ()  => ipcRenderer.invoke('get-settings'),
  saveSettings:  (s) => ipcRenderer.invoke('save-settings', s),
  closeSettings: ()  => ipcRenderer.invoke('close-settings'),
});
