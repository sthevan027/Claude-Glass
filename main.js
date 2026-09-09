const { app, BrowserWindow, ipcMain, screen, Notification, shell, Tray, Menu, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { getUsage } = require('./usage')
const auth = require('./auth')

// So o limite de heap do V8: a UI e minima (um SVG + pouco DOM), nao precisa
// do heap gigante que o V8 reserva por padrao. Cortou ~46MB (511 -> 465MB)
// num teste controlado, sem afetar nada visual. Tem que vir antes de
// app.whenReady(). (Testado tambem desativar GPU — piorou: a janela
// transparente forca composicao por software, que empurra o trabalho pro
// processo principal em vez de reduzir o total.)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64')

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
let tray
let trayWorking = null
let quitting = false

const TRAY_ICON_WORKING = path.join(__dirname, 'assets', 'tray-working.png')
const TRAY_ICON_IDLE = path.join(__dirname, 'assets', 'tray-idle.png')

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON_IDLE))
  tray.setToolTip('Claude Glass')
  // Clique alterna: esconde se estiver aberto, mostra se estiver escondido.
  tray.on('click', () => {
    if (!win || win.isDestroyed()) return
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mostrar',
        click: () => {
          if (!win || win.isDestroyed()) return
          win.show()
          win.focus()
        },
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  )
}

// So troca a imagem quando o estado muda de verdade, pra nao ficar
// re-setando o icone a cada tick do poll (4s por padrao).
function updateTrayIcon(active) {
  if (!tray) return
  const working = !!active
  if (working === trayWorking) return
  trayWorking = working
  tray.setImage(nativeImage.createFromPath(working ? TRAY_ICON_WORKING : TRAY_ICON_IDLE))
}

function loadConfig() {
  const defaults = {
    plan: 'max5x',
    startWithWindows: true,
    sessionTokenBudget: 630000000,
    weeklyTokenBudget: 3450000000,
    weeklyAnchorIso: null,
    alerts: true,
    alertThresholds: [80, 95],
    fireThreshold: 90,
    pollIntervalMs: 4000,
    activeThresholdMs: 20000,
    sleepThresholdMs: 300000,
    lockPosition: false,
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

// Area util da tela (exclui a barra de tarefas), do monitor onde a janela esta.
function currentWorkArea() {
  const display = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
  return display.workArea
}

// Empurra a janela de volta para dentro da area util caso ela tente ficar
// sobre/embaixo da barra de tarefas (ou fora da tela, em outro monitor).
function clampToWorkArea() {
  if (!win || win.isDestroyed()) return
  const wa = currentWorkArea()
  const b = win.getBounds()
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)
  if (x !== b.x || y !== b.y) win.setBounds({ x, y, width: b.width, height: b.height })
}

// Posicao ancorada no canto inferior direito da area util, colada (sem vao) acima da barra de tarefas.
const EDGE_MARGIN_X = 20
const EDGE_MARGIN_Y = 0
function anchoredPosition(width, height) {
  const wa = currentWorkArea()
  return {
    x: wa.x + wa.width - width - EDGE_MARGIN_X,
    y: wa.y + wa.height - height - EDGE_MARGIN_Y,
  }
}

function applyLockPosition() {
  if (!win || win.isDestroyed()) return
  win.setMovable(!config.lockPosition)
  if (config.lockPosition) {
    const { width, height } = win.getBounds()
    const { x, y } = anchoredPosition(width, height)
    win.setBounds({ x, y, width, height })
  }
}

function createWindow() {
  config = loadConfig()
  const W = 290
  const H = 580
  const { x, y } = anchoredPosition(W, H)

  win = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    movable: !config.lockPosition,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // Nunca deixa a janela ficar sobre/embaixo da barra de tarefas, mesmo durante
  // um arraste em andamento, nem sair da area util ao trocar de monitor/resolucao.
  win.on('move', clampToWorkArea)
  screen.on('display-metrics-changed', clampToWorkArea)
  applyLockPosition()

  // O X so esconde pra bandeja (igual Slack/Discord) — sair de verdade e
  // pelo menu do icone da bandeja ("Sair") ou app.quit() marcando `quitting`.
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })

  const tick = () => {
    if (!win || win.isDestroyed()) return
    try {
      const data = getUsage(config)
      win.webContents.send('usage', data)
      checkAlerts(config, data)
      updateTrayIcon(data.active)
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
  // Piso baixo o bastante para o card colapsado (140px): um piso de 280 forcava
  // a janela a ficar bem mais larga que o pet minimizado, deixando-o "flutuando"
  // longe da quina em vez de colado nela.
  const width = Math.max(100, Math.round(w))
  const height = Math.max(100, Math.round(h))
  win.setContentSize(width, height)
  const { x, y } = anchoredPosition(width, height)
  win.setPosition(x, y)
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
  applyAutoStart()
  applyLockPosition()
})

ipcMain.on('hide-window', () => {
  if (win && !win.isDestroyed()) win.hide()
})

// Respeita a escolha da pessoa em vez de re-registrar a cada abertura.
// Padrao ligado (config.startWithWindows), mas desmarcar realmente desliga.
function applyAutoStart() {
  if (!app.isPackaged) return // em dev nao mexe na inicializacao do Windows
  app.setLoginItemSettings({
    openAtLogin: config.startWithWindows !== false,
    openAsHidden: false,
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.datasystem.claude-glass')
  createWindow() // define `config`
  createTray()
  applyAutoStart()
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (pollTimer) clearInterval(pollTimer)
  app.quit()
})
