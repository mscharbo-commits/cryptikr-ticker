const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSettings:   ()      => ipcRenderer.invoke('get-settings'),
  saveSettings:  (s)     => ipcRenderer.invoke('save-settings', s),
  getStored:     (k)     => ipcRenderer.invoke('get-stored', k),
  setStored:     (k,v)   => ipcRenderer.invoke('set-stored', k, v),
  openSettings:  ()      => ipcRenderer.invoke('open-settings'),
  openCryptikr:  (id)    => ipcRenderer.invoke('open-cryptikr', id),
  openExternal:  (url)   => ipcRenderer.invoke('open-external', url),
  fetchPrices:   ()      => ipcRenderer.invoke('fetch-prices'),
  quit:              ()      => ipcRenderer.invoke('quit'),
  fetchMarketQuotes: ()      => ipcRenderer.invoke('fetch-market-quotes'),
});
