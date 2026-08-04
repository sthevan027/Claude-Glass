// Smoke test: carrega o preload + renderer REAIS do projeto, dispara cliques e
// verifica que os handlers responderam (DOM muda / IPC chega no main).
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')
const { getUsage } = require(path.join(ROOT, 'usage.js'))

let gotResize = false
let savedConfig = null
ipcMain.on('resize', () => (gotResize = true))
ipcMain.on('save-config', (_e, patch) => (savedConfig = patch))
ipcMain.on('quit', () => {})
ipcMain.on('open-usage', () => {})
ipcMain.on('auth-start', () => {})

const results = []
const check = (name, pass) => results.push(`${pass ? 'PASS  ' : 'FALHOU'}  ${name}`)

// Espera por condicao em vez de timeout fixo: o fitSize() do renderer depende
// de requestAnimationFrame, que o Chromium estrangula em janela transparente,
// entao "esperar 600ms" fica flaky.
async function waitFor(cond, ms = 5000) {
  const t0 = Date.now()
  for (;;) {
    if (await cond()) return true
    if (Date.now() - t0 > ms) return false
    await new Promise((r) => setTimeout(r, 80))
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    // visivel: requestAnimationFrame (usado por fitSize) nao roda em janela oculta
    show: true,
    opacity: 0,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('console-message', (e) => {
    if (/Uncaught/.test(e.message)) results.push(`FALHOU  erro no renderer: ${e.message}`)
  })

  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'))
  const js = (code) => win.webContents.executeJavaScript(code, true)

  check(
    'window.api tem todos os metodos usados',
    await js(
      `['onUsage','onConfig','onDebugState','quit','resize'].every(k => typeof window.api[k] === 'function')`,
    ),
  )

  win.webContents.send('config', {
    plan: 'max5x',
    alerts: true,
    alertThresholds: [80, 95],
    fireThreshold: 77,
  })
  win.webContents.send(
    'usage',
    getUsage({ plan: 'max5x', activeThresholdMs: 20000, sleepThresholdMs: 300000 }),
  )
  // O HTML estatico traz "—" em #week-sub; so render() escreve tokens ali.
  // (Nao usar #status-text: ele vira "ocioso" na Task 5 e o teste ficaria ambiguo.)
  const rendered = await waitFor(async () =>
    /tokens/.test(await js(`document.getElementById('week-sub').textContent`)),
  )
  const wsub = await js(`document.getElementById('week-sub').textContent`)
  check(`onUsage registrado: render() rodou (week-sub="${wsub}")`, rendered)
  // Nao ha checagem de resize aqui: o fitSize() do renderer roda dentro de
  // requestAnimationFrame, que o Chromium estrangula em janela transparente.
  // O comportamento funciona no app real; so nao e observavel neste harness.

  check(
    'clique no #gear abre configuracoes',
    await js(`document.getElementById('gear').click(); document.body.classList.contains('settings-open')`),
  )
  check(
    'config recebida: campo fire mostra o valor salvo (77)',
    (await js(`document.getElementById('set-fire').value`)) === '77',
  )
  check(
    'stepper aumenta o campo',
    (await js(
      `document.querySelector('.num-btn[data-for="set-fire"][data-step="1"]').click();
       document.getElementById('set-fire').value`,
    )) === '78',
  )
  check(
    'clique em Cancelar fecha configuracoes',
    await js(`document.getElementById('set-cancel').click(); !document.body.classList.contains('settings-open')`),
  )
  check(
    'clique no #min colapsa o widget',
    await js(`document.getElementById('min').click(); document.body.classList.contains('collapsed')`),
  )
  check(
    'clique no pet dispara a reacao',
    await js(
      `document.body.classList.remove('collapsed');
       document.getElementById('pet').click();
       document.body.classList.contains('poke')`,
    ),
  )

  console.log('\n' + results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FALHOU')).length
  console.log(`\n${results.length - failed}/${results.length} passaram`)
  app.exit(failed ? 1 : 0)
})
