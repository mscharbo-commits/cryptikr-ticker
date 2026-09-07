const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Cryptikr Ticker');

const TICKER_HEIGHT = 44;
const CG_KEY = 'CG-pwDvU5d2bQqDKVha9KGCkaCf';
const SETTINGS_PATH = path.join(app.getPath('userData'), 'cryptikr-settings.json');
const DEFAULTS = {
  coins: ['bitcoin','ethereum','solana','ripple','dogecoin','cardano','avalanche-2','chainlink','near','arbitrum'],
  speed: 50,
};

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
    }
  } catch(e) {}
  return Object.assign({}, DEFAULTS);
}

function writeSettings(s) {
  try {
    const merged = Object.assign({}, readSettings(), s);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch(e) { return readSettings(); }
}

let tickerWindow = null;
let settingsWindow = null;
let tray = null;
let isHidden = false;

function createTrayIcon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="4" fill="#F59E0B"/><text x="8" y="12" text-anchor="middle" font-size="11" font-weight="bold" fill="#000">k</text></svg>';
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function createTickerWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  tickerWindow = new BrowserWindow({
    width, height: TICKER_HEIGHT, x: 0, y: 0,
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
    width: 480, height: 600,
    title: 'Cryptikr Ticker — Settings',
    resizable: false, minimizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function buildTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Cryptikr Ticker');
  const menu = Menu.buildFromTemplate([
    { label: 'Cryptikr Ticker', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettingsWindow() },
    { label: 'Open Cryptikr', click: () => shell.openExternal('https://cryptikr.vercel.app') },
    { type: 'separator' },
    { label: isHidden ? 'Show Ticker' : 'Hide Ticker', click: () => {
        isHidden = !isHidden;
        if (tickerWindow) isHidden ? tickerWindow.hide() : tickerWindow.show();
        buildTray();
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => { createTickerWindow(); buildTray(); });
app.on('window-all-closed', (e) => e.preventDefault());

ipcMain.handle('get-settings', () => readSettings());

ipcMain.handle('save-settings', (_, s) => {
  const saved = writeSettings(s);
  setTimeout(() => { if (tickerWindow) tickerWindow.webContents.reload(); }, 500);
  return saved;
});

ipcMain.handle('close-settings', () => { if (settingsWindow) settingsWindow.close(); });
ipcMain.handle('open-settings',  () => createSettingsWindow());
ipcMain.handle('open-cryptikr', (_, id) => { shell.openExternal('https://cryptikr.vercel.app' + (id ? '/crypto/' + id : '')); });
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('quit', () => app.quit());

ipcMain.handle('fetch-prices', async () => {
  try {
    const { coins } = readSettings();
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + coins.join(',') + '&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h';
    const r = await fetch(url, { headers: { 'x-cg-demo-api-key': CG_KEY } });
    if (!r.ok) return [];
    return await r.json();
  } catch(e) { return []; }
});

ipcMain.handle('fetch-market-quotes', async () => {
  const FINNHUB = 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
  const SYMS = ['SPY','QQQ','GLD'];
  try {
    const results = await Promise.all(SYMS.map(async (sym) => {
      const r = await fetch('https://finnhub.io/api/v1/quote?symbol=' + sym + '&token=' + FINNHUB);
      if (!r.ok) return null;
      const d = await r.json();
      return d.c ? { sym, c: d.c, dp: d.dp } : null;
    }));
    return results.filter(Boolean);
  } catch(e) { return []; }
});
