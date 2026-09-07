const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

app.setName('Cryptikr Ticker');

const TICKER_HEIGHT = 44;
const CG_KEY = 'CG-pwDvU5d2bQqDKVha9KGCkaCf';

// electron-store
let Store, store;
try {
  Store = require('electron-store');
  store = new Store({
    defaults: {
      coins: ['bitcoin','ethereum','solana','ripple','dogecoin','cardano','avalanche-2','chainlink','near','arbitrum'],
      speed: 50,
      theme: 'dark',
    }
  });
} catch(e) {
  console.warn('electron-store not available:', e.message);
  store = null;
}

function getSettings()       { return store ? store.store : { coins: ['bitcoin','ethereum','solana','ripple','dogecoin','cardano'] }; }
function saveSettings(s)     { if (store) Object.assign(store.store, s); return getSettings(); }
function getStored(key)      { return store ? store.get(key) : null; }
function setStored(key, val) { if (store) store.set(key, val); }

let tickerWindow = null;
let settingsWindow = null;
let tray = null;
let isHidden = false;

// Tray icon
function createTrayIcon() {
  const size = process.platform === 'darwin' ? 16 : 32;
  return nativeImage.createFromDataURL(
    `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFASURBVDiNpdMxS8NAGAbgJ0kHwUEnB0FwcXFwcXFwcBIEQXAQBEFwcBIEB0EQBAf/gIODg4ODIAiCg4ODg4ODg4MgCIIgCIIg+A+SOAiCIAiC+A+SOAiCIAiC+A+SOA==`
  ).resize({ width: size, height: size });
}

function createTickerWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  tickerWindow = new BrowserWindow({
    width, height: TICKER_HEIGHT,
    x: 0, y: 0,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  tickerWindow.loadFile('ticker.html');
  if (process.platform === 'darwin') {
    tickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    tickerWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  tickerWindow.on('closed', () => { tickerWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 480, height: 560,
    title: 'Cryptikr Ticker Settings',
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Cryptikr Ticker');
  const menu = Menu.buildFromTemplate([
    { label: 'Cryptikr Ticker', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettingsWindow() },
    { label: 'Open Cryptikr', click: () => shell.openExternal('https://cryptikr.vercel.app') },
    { label: isHidden ? 'Show Ticker' : 'Hide Ticker', click: () => {
        isHidden = !isHidden;
        if (tickerWindow) isHidden ? tickerWindow.hide() : tickerWindow.show();
        createTray();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  createTickerWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault());

// IPC
ipcMain.handle('get-settings', () => getSettings());
ipcMain.handle('save-settings', (_, s) => saveSettings(s));
ipcMain.handle('get-stored', (_, k) => getStored(k));
ipcMain.handle('set-stored', (_, k, v) => setStored(k, v));
ipcMain.handle('open-settings', () => createSettingsWindow());
ipcMain.handle('open-cryptikr', (_, coinId) => {
  shell.openExternal('https://cryptikr.vercel.app' + (coinId ? '/crypto/' + coinId : ''));
});
ipcMain.handle('fetch-prices', async () => {
  try {
    const settings = getSettings();
    const ids = (settings.coins || []).join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h`;
    const r = await fetch(url, { headers: { 'x-cg-demo-api-key': CG_KEY } });
    if (!r.ok) return [];
    return await r.json();
  } catch(e) { return []; }
});
