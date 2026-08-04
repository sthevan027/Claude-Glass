const { app, BrowserWindow, ipcMain, screen, Notification, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { getUsage } = require('./usage')
const auth = require('./auth')

const DATA_DIR = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, 'claude-glass')
  : path.join(os.homedir(), '.claude-glass')

if (process.env.CLAUDE_CONFIG_DIR) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  app.setPath('userData', path.join(DATA_DIR, 'electron'))
}

const EXTERNAL_CONFIG = path.join(DATA_DIR, 'config.json')

let win
let pollTimer
let config

function loadConfig() {
  const defaults = {
    plan: 'max5x',
    sessionTokenBudget: 630000000,
    weeklyTokenBudget: 3450000000,
    weeklyAnchorIso: null,
    alerts: true,
    alertThresholds: [80, 95],
    fireThreshold: 90,
    pollIntervalMs: 4000,
    activeThresholdMs: 20000,
    sleepThresholdMs: 300000,
  }
  for (const p of [EXTERNAL_CONFIG, path.join(__dirname, 'config.json')]) {
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(p, 'utf8')) }
    } catch {}
  }
  return defaults
}

const armed = new Set()
function checkAlerts(config, d) {
  if (!config.alerts || !Notification.isSupported()) return
  const ths = config.alertThresholds || [80, 95]
  const scopes = [
    ['sessão', d.session.pct],
    ['uso semanal', d.week.pct],
  ]
  for (const [name, pct] of scopes) {
    for (const t of ths) {
      const key = `${name}:${t}`
      if (pct >= t) {
        if (!armed.has(key)) {
          armed.add(key)
          new Notification({
            title: 'Claude Glass',
            body: `Sua ${name} passou de ${t}% — agora em ${Math.round(pct)}%`,
            silent: false,
          }).show()
        }
      } else {
        armed.delete(key)
      }
    }
  }
}

function createWindow() {
  config = loadConfig()
  const { workAreaSize } = screen.getPrimaryDisplay()
  const W = 290
  const H = 580

  win = new BrowserWindow({
    width: W,
    height: H,
    x: workAreaSize.width - W - 20,
    y: workAreaSize.height - H - 20,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'floating')
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  const tick = () => {
    if (!win || win.isDestroyed()) return
    try {
      const data = getUsage(config)
      win.webContents.send('usage', data)
      checkAlerts(config, data)
    } catch (err) {
      win.webContents.send('usage-error', String(err))
    }
  }

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('config', config)
    tick()
    win.webContents.send('auth-state', { connected: auth.isConnected() })
    pollTimer = setInterval(tick, config.pollIntervalMs)
    startUsagePoll()
    sendProfile()
  })
}

ipcMain.on('resize', (_e, w, h) => {
  if (!win || win.isDestroyed()) return
  const width = Math.max(280, Math.round(w))
  const height = Math.max(200, Math.round(h))
  win.setContentSize(width, height)
  const { workAreaSize } = screen.getPrimaryDisplay()
  win.setPosition(workAreaSize.width - width - 20, workAreaSize.height - height - 20)
})

ipcMain.on('open-usage', () => shell.openExternal('https://claude.ai/settings/usage'))

// OAuth usage polling
let usageTimer = null
let usageBackoff = 5 * 60 * 1000
function scheduleUsagePoll() {
  clearTimeout(usageTimer)
  if (auth.isConnected()) usageTimer = setTimeout(pollUsage, usageBackoff)
}
async function pollUsage() {
  try {
    const u = await auth.fetchUsage()
    usageBackoff = 5 * 60 * 1000
    if (win && !win.isDestroyed()) win.webContents.send('real-usage', u)
  } catch (e) {
    if (e && e.status === 429) {
      usageBackoff = Math.min(usageBackoff * 2, 30 * 60 * 1000)
    } else if (e && e.status === 401) {
      auth.clear()
      if (win && !win.isDestroyed()) {
        win.webContents.send('auth-state', { connected: false })
        win.webContents.send('real-usage', null)
        win.webContents.send('profile', null)
      }
    }
  }
  scheduleUsagePoll()
}
function startUsagePoll() {
  if (auth.isConnected()) pollUsage()
}

async function sendProfile() {
  if (!auth.isConnected()) return
  try {
    const p = await auth.fetchProfile()
    if (win && !win.isDestroyed()) win.webContents.send('profile', p)
  } catch {}
}

ipcMain.on('auth-start', () => shell.openExternal(auth.begin()))
ipcMain.on('auth-code', async (_e, code) => {
  const ok = () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('auth-state', { connected: true })
      win.webContents.send('auth-result', { ok: true })
    }
    sendProfile()
  }
  try {
    await auth.complete(code)
    usageBackoff = 5 * 60 * 1000
    try {
      const u = await auth.fetchUsage()
      ok()
      if (win && !win.isDestroyed()) win.webContents.send('real-usage', u)
    } catch (e) {
      if (e && e.status === 429) ok()
      else throw e
    }
    scheduleUsagePoll()
  } catch (err) {
    auth.clear()
    if (win && !win.isDestroyed())
      win.webContents.send('auth-result', { ok: false, error: String(err?.message || err) })
  }
})
ipcMain.on('auth-logout', () => {
  auth.clear()
  clearTimeout(usageTimer)
  if (win && !win.isDestroyed()) {
    win.webContents.send('auth-state', { connected: false })
    win.webContents.send('real-usage', null)
    win.webContents.send('profile', null)
  }
})

ipcMain.on('save-config', (_e, patch) => {
  let obj = {}
  for (const p of [EXTERNAL_CONFIG, path.join(__dirname, 'config.json')]) {
    try {
      obj = JSON.parse(fs.readFileSync(p, 'utf8'))
      break
    } catch {}
  }
  Object.assign(obj, patch)
  try {
    fs.mkdirSync(path.dirname(EXTERNAL_CONFIG), { recursive: true })
    fs.writeFileSync(EXTERNAL_CONFIG, JSON.stringify(obj, null, 2))
  } catch {}
  config = loadConfig()
  armed.clear()
  if (win && !win.isDestroyed()) win.webContents.send('config', config)
})

ipcMain.on('quit', () => app.quit())

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.datasystem.claude-glass')
  createWindow()
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false })
  }
})

app.on('window-all-closed', () => {
  if (pollTimer) clearInterval(pollTimer)
  app.quit()
})
