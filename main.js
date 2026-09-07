const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

app.setName('Cryptikr Ticker');

const TICKER_HEIGHT = 44;
const CG_KEY = 'CG-pwDvU5d2bQqDKVha9KGCkaCf';

const fs = require('fs');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'cryptikr-settings.json');
const DEFAULTS = {
  coins: ['bitcoin','ethereum','solana','ripple','dogecoin','cardano','avalanche-2','chainlink','near','arbitrum'],
  speed: 50,
};

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const s = JSON.parse(raw);
      console.log('Get settings:', JSON.stringify(s));
      return Object.assign({}, DEFAULTS, s);
    }
  } catch(e) { console.error('getSettings error:', e.message); }
  return Object.assign({}, DEFAULTS);
}

function saveSettings(s) {
  try {
    const current = getSettings();
    const merged = Object.assign({}, current, s);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
    console.log('Saved:', JSON.stringify(merged));
    return merged;
  } catch(e) { console.error('saveSettings error:', e.message); return getSettings(); }
}

function getStored(key)      { return getSettings()[key]; }
function setStored(key, val) { const s = {}; s[key] = val; saveSettings(s); }

let tickerWindow = null;
let settingsWindow = null;
let tray = null;
let isHidden = false;

function createTrayIcon() {
  const size = process.platform === 'darwin' ? 16 : 32;
  // Simple amber square icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
    <rect width="16" height="16" rx="4" fill="#F59E0B"/>
    <text x="8" y="12" text-anchor="middle" font-size="11" font-weight="bold" fill="#000">₿</text>
  </svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function createTickerWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  tickerWindow = new BrowserWindow({
    width, height: TICKER_HEIGHT,
    x: 0, y: 0,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
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
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    // Reload ticker after settings saved
    if (tickerWindow) tickerWindow.webContents.reload();
  });
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
      }
    },
    { type: 'separator' },
    { label: 'Quit Cryptikr Ticker', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  createTickerWindow();
  buildTray();
});

app.on('window-all-closed', (e) => e.preventDefault());

// IPC handlers
ipcMain.handle('get-settings',   () => getSettings());
ipcMain.handle('save-settings',  (_, s) => {
  saveSettings(s);
  // Give store time to write, then reload ticker
  setTimeout(() => {
    if (tickerWindow) tickerWindow.webContents.reload();
  }, 300);
  return true;
});
ipcMain.handle('get-stored',     (_, k) => getStored(k));
ipcMain.handle('set-stored',     (_, k, v) => setStored(k, v));
ipcMain.handle('open-settings',  () => createSettingsWindow());
ipcMain.handle('open-cryptikr',  (_, coinId) => {
  shell.openExternal('https://cryptikr.vercel.app' + (coinId ? '/crypto/' + coinId : ''));
});
ipcMain.handle('open-external',  (_, url) => shell.openExternal(url));
ipcMain.handle('quit',           () => app.quit());
ipcMain.handle('close-settings', () => { if (settingsWindow) settingsWindow.close(); });
ipcMain.handle('fetch-market-quotes', async () => {
  const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
  const SYMS = ['SPY','QQQ','DXY','GLD'];
  try {
    const results = await Promise.all(SYMS.map(async (sym) => {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d.c ? { sym, c: d.c, d: d.d, dp: d.dp } : null;
    }));
    return results.filter(Boolean);
  } catch(e) { return []; }
});
ipcMain.handle('fetch-prices', async () => {
  try {
    const settings = getSettings();
    const ids = (settings.coins || []).join(',');
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + ids + '&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h';
    const r = await fetch(url, { headers: { 'x-cg-demo-api-key': CG_KEY } });
    if (!r.ok) { console.log('CoinGecko error:', r.status); return []; }
    const data = await r.json();
    console.log('Got coins:', data.map(function(c){return c.symbol;}).join(','));
    return data;
  } catch(e) { console.error('fetch-prices error:', e); return []; }
});
