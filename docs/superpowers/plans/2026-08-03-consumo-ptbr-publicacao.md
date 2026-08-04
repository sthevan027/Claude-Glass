# Claude Glass — consumo visível, pt-BR e publicação · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir o consumo de tokens da sessão e da semana com ou sem conta conectada, traduzir a interface para pt-BR e deixar o projeto pronto para publicação no GitHub.

**Architecture:** App Electron de três camadas — `main.js` (processo principal, IPC, janela), `preload.js` (bridge `contextBridge`) e `renderer/` (UI). O `usage.js` já calcula tudo lendo os `.jsonl` do Claude Code; o trabalho é quase todo de apresentação. Nenhuma dependência nova.

**Tech Stack:** Electron 42, JavaScript puro (sem framework, sem build de renderer), electron-builder para empacotar.

## Global Constraints

- **Sem dependências novas.** O projeto tem só `electron` e `electron-builder` como devDependencies.
- **Tokens são exatos, porcentagens podem ser estimadas.** Nunca marcar tokens como estimativa; nunca exibir % estimada sem o prefixo `~`.
- **Interface em pt-BR.** Exceção: as animações decorativas do pet (`#terminal`, `#reading`) e o nome "Claude Glass" ficam em inglês.
- **Separador decimal é vírgula** em todo número exibido.
- **O token nunca entra no repositório.** Ele vive em `%USERPROFILE%\.claude-usage-monitor\auth.json`.
- **Não fazer `git push`.** A publicação é da autora.
- Rodar os testes com `ELECTRON_RUN_AS_NODE` ausente do ambiente — a variável faz o binário do Electron virar Node puro e o app quebra em `main.js:120`. O launcher em `test/smoke/run.js` já remove.

**Refinamento sobre o spec:** o spec previa `· estimado` na sublinha de cada medidor. Isso foi trocado por **uma nota única abaixo dos dois medidores** (`% estimada pelo plano Max 5x · conecte a conta para o valor real`). Motivo: "estimado" ao lado do número de tokens sugeriria que os tokens são estimados, e eles são exatos. A Tarefa 3 atualiza o spec para refletir isso.

---

### Task 1: Repositório publicável

Primeiro porque todas as tarefas seguintes fazem commit, e sem `.gitignore` o primeiro `git add` puxaria 945 MB.

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Consumes: nada
- Produces: repositório git inicializado com `main` como branch, `dist/` e `node_modules/` ignorados

- [ ] **Step 1: Criar o `.gitignore`**

```gitignore
node_modules/
dist/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Criar o `LICENSE`** (MIT, mesma licença declarada no `package.json`)

```
MIT License

Copyright (c) 2026 Vitória Silva

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Inicializar o repositório**

```bash
git init -b main
git remote add origin https://github.com/vitoriahellen/Claude-Glass.git
```

- [ ] **Step 4: Verificar que nada pesado ou sensível entraria**

```bash
git add -A
git status --short
git diff --cached --stat | tail -3
```

Esperado: nenhuma linha começando com `node_modules/` ou `dist/`; o total deve ficar abaixo de ~2 MB e listar apenas `main.js`, `preload.js`, `usage.js`, `auth.js`, `config.json`, `package.json`, `package-lock.json`, `renderer/*`, `docs/*`, `.gitignore`, `LICENSE`.

Se aparecer `node_modules/` ou `dist/`, PARE: rode `git rm -r --cached node_modules dist` e revise o `.gitignore` antes de continuar.

- [ ] **Step 5: Varredura por segredos antes do primeiro commit**

```bash
git diff --cached -U0 | grep -nE "sk-ant|access_token|refresh_token|Bearer [A-Za-z0-9_-]{20}" || echo "OK: nenhum segredo"
```

Esperado: `OK: nenhum segredo`

- [ ] **Step 6: Commit**

```bash
git commit -m "chore: inicializa repositorio com .gitignore e licenca MIT"
```

---

### Task 2: Testes no repositório (`npm test`)

O bug que derrubava todos os botões foi um método faltando na bridge `preload`/`renderer`. Um teste estático de paridade pega essa classe inteira de bug em milissegundos, e o smoke test em Electron prova que os cliques funcionam de verdade.

**Files:**
- Create: `test/bridge-parity.js`
- Create: `test/smoke/main.js`
- Create: `test/smoke/package.json`
- Create: `test/smoke/run.js`
- Modify: `package.json` (bloco `scripts`)

**Interfaces:**
- Consumes: nada
- Produces: `npm test` (paridade + smoke), `npm run test:parity`, `npm run test:smoke`. O smoke test expõe o helper `check(nome, condicao)` que acumula em `results[]` e sai com código 1 se algo falhar — as tarefas seguintes acrescentam checagens nele.

- [ ] **Step 1: Escrever o teste de paridade da bridge**

Create `test/bridge-parity.js`:

```js
// Verifica que todo `window.api.<x>` usado no renderer existe no preload.
// Um metodo faltando derruba o pet.js inteiro no primeiro uso e mata todos os
// listeners de clique registrados depois dele.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8')
const bridge = preload.slice(preload.indexOf('exposeInMainWorld'))
const exposed = new Set([...bridge.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]))

const rendererDir = path.join(ROOT, 'renderer')
const used = new Map()
for (const f of fs.readdirSync(rendererDir).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(rendererDir, f), 'utf8')
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/window\.api\.(\w+)/g)) {
      if (!used.has(m[1])) used.set(m[1], `${f}:${i + 1}`)
    }
  })
}

const missing = [...used].filter(([name]) => !exposed.has(name))

console.log(`preload expoe : ${[...exposed].join(', ')}`)
console.log(`renderer usa  : ${[...used.keys()].join(', ')}`)

if (missing.length) {
  console.error('\nFALHOU - metodos usados no renderer e ausentes no preload:')
  for (const [name, where] of missing) console.error(`  window.api.${name}  (${where})`)
  process.exit(1)
}
console.log('\nOK - bridge preload/renderer esta completa.')
```

- [ ] **Step 2: Rodar o teste de paridade**

Run: `node test/bridge-parity.js`
Expected: PASS — `OK - bridge preload/renderer esta completa.` (a bridge já foi corrigida)

- [ ] **Step 3: Escrever o launcher do smoke test**

O launcher existe para remover `ELECTRON_RUN_AS_NODE` do ambiente, que em terminais dentro do VS Code faz o Electron virar Node puro e o app quebrar antes de abrir.

Create `test/smoke/run.js`:

```js
// Lanca o smoke test em Electron com ELECTRON_RUN_AS_NODE removido: em
// terminais dentro do VS Code essa variavel vem setada e faz o binario do
// Electron rodar como Node puro, quebrando o app em main.js:120.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const electron = require('electron') // caminho do binario
const r = spawnSync(electron, [__dirname], { env, stdio: 'inherit' })
process.exit(r.status === null ? 1 : r.status)
```

- [ ] **Step 4: Escrever o app do smoke test**

Create `test/smoke/package.json`:

```json
{ "name": "claude-glass-smoke", "version": "1.0.0", "main": "main.js" }
```

Create `test/smoke/main.js`:

```js
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

  win.webContents.send('config', { plan: 'max5x', alerts: true, alertThresholds: [80, 95], fireThreshold: 77 })
  win.webContents.send('usage', getUsage({ plan: 'max5x', activeThresholdMs: 20000, sleepThresholdMs: 300000 }))
  await new Promise((r) => setTimeout(r, 600))

  // O HTML estatico traz "—" em #week-sub; so render() escreve tokens ali.
  // (Nao usar #status-text: ele vira "ocioso" na Task 5 e o teste ficaria ambiguo.)
  const wsub = await js(`document.getElementById('week-sub').textContent`)
  check(`onUsage registrado: render() rodou (week-sub="${wsub}")`, /tokens/.test(wsub))
  check('render() pediu resize da janela ao main', gotResize)

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
```

- [ ] **Step 5: Ligar os scripts no `package.json`**

Modify `package.json`, bloco `scripts` (hoje tem só `start` e `dist:win`):

```json
  "scripts": {
    "start": "electron .",
    "test": "npm run test:parity && npm run test:smoke",
    "test:parity": "node test/bridge-parity.js",
    "test:smoke": "node test/smoke/run.js",
    "dist:win": "npx electron-builder --win zip"
  },
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: paridade OK e `9/9 passaram`

- [ ] **Step 7: Commit**

```bash
git add test package.json
git commit -m "test: adiciona teste de paridade da bridge e smoke test de cliques"
```

---

### Task 3: Consumo visível sem conta conectada

**Files:**
- Modify: `renderer/style.css:499-507` (regras de visibilidade)
- Modify: `renderer/index.html:243-265` (bloco `#limits`)
- Modify: `renderer/pet.js:420-533` (função `render`)
- Modify: `docs/superpowers/specs/2026-08-03-consumo-ptbr-publicacao-design.md` (alinhar ao refinamento)
- Test: `test/smoke/main.js`

**Interfaces:**
- Consumes: `check()` do smoke test (Task 2)
- Produces: elemento `#limits-est` com `<b id="est-plan">` dentro, que a Task 4 atualiza com o nome do plano escolhido; constante `PLAN_LABELS` em `pet.js` mapeando `pro|max5x|max20x` → rótulo exibido

- [ ] **Step 1: Escrever as checagens que falham**

Acrescentar em `test/smoke/main.js`, logo antes do `console.log('\n' + results.join('\n'))`:

```js
  // --- consumo visivel sem conta conectada ---
  // Estado limpo: painel fechado e card expandido, senao os medidores estariam
  // escondidos por um ancestral e o teste mediria a coisa errada.
  await js(`document.body.classList.remove('settings-open', 'collapsed')`)
  // getClientRects() leva ancestrais em conta; getComputedStyle(el).display nao
  // — um elemento dentro de um pai display:none ainda reporta o proprio display.
  const vis = (id) => js(`document.getElementById('${id}').getClientRects().length > 0`)

  check('medidores visiveis sem conexao', await vis('limits-meters'))
  check('nota de estimativa visivel sem conexao', await vis('limits-est'))
  check(
    'porcentagem marcada com ~ sem conexao',
    (await js(`document.getElementById('session-pct').textContent`)).startsWith('~'),
  )
  check(
    'tokens da semana exibidos sem conexao',
    /tokens/.test(await js(`document.getElementById('week-sub').textContent`)),
  )

  win.webContents.send('real-usage', {
    session: { pct: 32, resetMs: 8040000 },
    week: { pct: 41, resetMs: null },
  })
  await new Promise((r) => setTimeout(r, 300))

  check(
    'com conexao a porcentagem perde o ~',
    !(await js(`document.getElementById('session-pct').textContent`)).startsWith('~'),
  )
  check('com conexao a nota de estimativa some', !(await vis('limits-est')))
  check(
    'com conexao a % vem da API (32%)',
    (await js(`document.getElementById('session-pct').textContent`)) === '32%',
  )
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:smoke`
Expected: FALHOU em `medidores visiveis sem conexao` e em `nota de estimativa visivel sem conexao` (o elemento `#limits-est` ainda nem existe, então o `getElementById` retorna `null` e a promessa rejeita — isso também conta como falha)

- [ ] **Step 3: Remover as regras que escondem o consumo**

Modify `renderer/style.css` — apagar estas duas regras (linhas 502-507), mantendo `body.live #limits-connect { display: none; }` intacta:

```css
body:not(.live) #limits-meters {
  display: none;
}
body:not(.live) #mini-pct-row {
  display: none;
}
```

- [ ] **Step 4: Adicionar a nota de estimativa**

Modify `renderer/index.html` — inserir logo depois do `</div>` que fecha `#limits-meters` e antes de `<button id="limits-connect">`:

```html
          <div id="limits-est">
            % estimada pelo plano <b id="est-plan">Max 5x</b> · conecte a conta para o valor real
          </div>
```

Modify `renderer/style.css` — acrescentar junto das outras regras de `#limits` (perto da linha 499):

```css
#limits-est {
  font-size: 9px;
  line-height: 1.35;
  color: var(--muted);
  text-align: left;
  margin: 6px 0 2px;
}
#limits-est b {
  color: var(--text);
  font-weight: 600;
}
body.live #limits-est {
  display: none;
}
```

- [ ] **Step 5: Trocar a origem dos valores em `render()`**

Modify `renderer/pet.js` — substituir o bloco das linhas 421-429:

```js
  // % comes only from the connected account — no estimates
  const liveOn = !!realUsage
  document.body.classList.toggle('live', liveOn)
  const sessPct = liveOn ? realUsage.session.pct : 0
  const sessReset = liveOn ? realUsage.session.resetMs : null
  const sessActive = liveOn && sessReset != null
  const wkPct = liveOn ? realUsage.week.pct : 0
  const wkReset = liveOn ? realUsage.week.resetMs : null
```

por:

```js
  // Tokens vem sempre dos logs locais e sao exatos. A % vem da API quando ha
  // conta conectada; sem conta, e estimada pelo orcamento do plano e ganha "~".
  const liveOn = !!realUsage
  document.body.classList.toggle('live', liveOn)
  const est = liveOn ? '' : '~'
  const sessPct = liveOn ? realUsage.session.pct : d.session.pct
  const sessReset = liveOn
    ? realUsage.session.resetMs
    : d.session.active
      ? d.session.resetMs
      : null
  const sessActive = sessReset != null
  const wkPct = liveOn ? realUsage.week.pct : d.week.pct
  const wkReset = liveOn ? realUsage.week.resetMs : d.week.resetMs
```

- [ ] **Step 6: Aplicar o prefixo e reordenar as sublinhas**

Modify `renderer/pet.js` — substituir as linhas 497-515:

```js
  el('session-pct').textContent = `${Math.round(sessPct)}%`
  const mini = el('mini-pct')
  mini.textContent = liveOn ? `${Math.round(sessPct)}%` : '—'
  mini.classList.toggle('high', liveOn && sessPct >= 80)
  const sf = el('session-fill')
  sf.style.width = `${sessPct}%`
  sf.classList.toggle('high', sessPct >= 80)
  el('session-sub').textContent = sessActive
    ? `reset em ${fmtReset(sessReset)} · ${fmtTokens(d.session.tokens)} tokens`
    : 'sem sessão ativa'

  el('week-pct').textContent = `${Math.round(wkPct)}%`
  const wf = el('week-fill')
  wf.style.width = `${wkPct}%`
  wf.classList.toggle('high', wkPct >= 80)
  el('week-sub').textContent =
    wkReset != null
      ? `reset em ${fmtReset(wkReset)} · ${fmtTokens(d.week.tokens)} tokens`
      : `${fmtTokens(d.week.tokens)} tokens · últimos 7 dias`
```

por:

```js
  el('session-pct').textContent = `${est}${Math.round(sessPct)}%`
  const mini = el('mini-pct')
  mini.textContent = `${est}${Math.round(sessPct)}%`
  mini.classList.toggle('high', sessPct >= 80)
  const sf = el('session-fill')
  sf.style.width = `${sessPct}%`
  sf.classList.toggle('high', sessPct >= 80)
  el('session-sub').textContent = sessActive
    ? `${fmtTokens(d.session.tokens)} tokens · reset em ${fmtReset(sessReset)}`
    : 'sem sessão ativa'

  el('week-pct').textContent = `${est}${Math.round(wkPct)}%`
  const wf = el('week-fill')
  wf.style.width = `${wkPct}%`
  wf.classList.toggle('high', wkPct >= 80)
  el('week-sub').textContent =
    wkReset != null
      ? `${fmtTokens(d.week.tokens)} tokens · reset em ${fmtReset(wkReset)}`
      : `${fmtTokens(d.week.tokens)} tokens · últimos 7 dias`
```

- [ ] **Step 7: Nomear o plano na nota**

Modify `renderer/pet.js` — acrescentar perto do topo, logo depois de `const el = (id) => document.getElementById(id)`:

```js
const PLAN_LABELS = { pro: 'Pro', max5x: 'Max 5x', max20x: 'Max 20x' }
```

e dentro do handler `window.api.onConfig` (linha ~566), depois de `currentConfig = cfg || {}`:

```js
  el('est-plan').textContent = PLAN_LABELS[currentConfig.plan] || 'Max 5x'
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm test`
Expected: `16/16 passaram`

- [ ] **Step 9: Alinhar o spec ao refinamento**

Modify o spec: na seção "Layout", trocar as duas linhas `47,2M tokens · estimado · reset em 2h 14m` e `1,4B tokens · estimado · últimos 7 dias` por `47,2M tokens · reset em 2h 14m` e `1,4B tokens · últimos 7 dias`, e acrescentar depois do bloco de layout:

```markdown
Abaixo dos dois medidores, uma nota única quando não há conexão:
`% estimada pelo plano Max 5x · conecte a conta para o valor real`. A marcação
de incerteza fica ali e no prefixo `~`, nunca ao lado do número de tokens —
tokens são exatos.
```

Na seção "Mudanças", trocar `sublinhas ganham · estimado quando !liveOn` por `nota única #limits-est abaixo dos medidores, oculta quando liveOn`.

- [ ] **Step 10: Commit**

```bash
git add renderer test docs
git commit -m "feat: mostra tokens gastos e % estimada sem conta conectada"
```

---

### Task 4: Seletor de plano nas Configurações

A % estimada da Task 3 depende de `config.plan`, hoje fixo em `"max5x"` e sem controle na interface.

**Files:**
- Modify: `renderer/index.html` (painel `#settings`)
- Modify: `renderer/style.css` (estilo do seletor segmentado)
- Modify: `renderer/pet.js` (estado, populate, dirty, save)
- Test: `test/smoke/main.js`

**Interfaces:**
- Consumes: `PLAN_LABELS` (Task 3), `check()` (Task 2)
- Produces: `saveConfig({ plan })` passa a incluir a chave `plan` com valor `'pro' | 'max5x' | 'max20x'`

- [ ] **Step 1: Escrever as checagens que falham**

Acrescentar em `test/smoke/main.js`, antes do bloco de impressão dos resultados:

```js
  // --- seletor de plano ---
  await js(`document.getElementById('gear').click()`)
  check(
    'plano atual vem marcado no seletor',
    (await js(`document.querySelector('#set-plan .seg-btn.on').dataset.plan`)) === 'max5x',
  )
  await js(`document.querySelector('#set-plan .seg-btn[data-plan="pro"]').click()`)
  check(
    'clicar em Pro move a marcacao',
    (await js(`document.querySelector('#set-plan .seg-btn.on').dataset.plan`)) === 'pro',
  )
  check(
    'trocar o plano acende o botao Salvar',
    await js(`document.getElementById('set-save').classList.contains('dirty')`),
  )
  await js(`document.getElementById('set-save').click()`)
  await new Promise((r) => setTimeout(r, 200))
  check('salvar envia o plano escolhido ao main', savedConfig && savedConfig.plan === 'pro')
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:smoke`
Expected: FALHOU em `plano atual vem marcado no seletor` (o `querySelector` devolve `null` porque `#set-plan` não existe)

- [ ] **Step 3: Adicionar o seletor ao HTML**

Modify `renderer/index.html` — inserir logo depois de `</div>` que fecha `#account` e antes de `<label class="set-check">`:

```html
        <label class="set-field">Plano
          <span id="set-plan" class="seg">
            <button type="button" class="seg-btn" data-plan="pro">Pro</button>
            <button type="button" class="seg-btn" data-plan="max5x">Max 5x</button>
            <button type="button" class="seg-btn" data-plan="max20x">Max 20x</button>
          </span>
        </label>
        <div class="set-hint set-hint-left">Base para estimar a % enquanto a conta não está conectada.</div>
```

- [ ] **Step 4: Estilizar o seletor**

Modify `renderer/style.css` — acrescentar junto das outras regras do painel de configurações:

```css
.seg {
  display: flex;
  gap: 3px;
  margin-top: 4px;
  -webkit-app-region: no-drag;
}
.seg-btn {
  flex: 1;
  padding: 4px 0;
  font-size: 9.5px;
  font-family: inherit;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.04);
  border: 0.5px solid var(--hair);
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.seg-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.seg-btn.on {
  color: var(--text);
  background: rgba(217, 119, 87, 0.18);
  border-color: rgba(217, 119, 87, 0.55);
}
```

- [ ] **Step 5: Ligar o seletor no `pet.js`**

Modify `renderer/pet.js`:

a) Junto das outras variáveis de estado das configurações (perto de `let settingsBaseline = null`):

```js
let planChoice = 'max5x'
function paintPlan() {
  for (const b of document.querySelectorAll('#set-plan .seg-btn')) {
    b.classList.toggle('on', b.dataset.plan === planChoice)
  }
}
for (const b of document.querySelectorAll('#set-plan .seg-btn')) {
  b.addEventListener('click', () => {
    planChoice = b.dataset.plan
    paintPlan()
    refreshSaveDirty()
  })
}
```

b) Em `snapshotSettings()`, incluir o plano no objeto serializado:

```js
function snapshotSettings() {
  return JSON.stringify({
    plan: planChoice,
    alerts: el('set-alerts').checked,
    t1: el('set-t1').value,
    t2: el('set-t2').value,
    fire: el('set-fire').value,
  })
}
```

c) Em `populateSettings()`, antes do `clearSaveDirty()`:

```js
  planChoice = PLAN_LABELS[c.plan] ? c.plan : 'max5x'
  paintPlan()
```

d) No handler de `set-save`, incluir `plan` no patch enviado:

```js
  window.api.saveConfig({
    plan: planChoice,
    alerts: el('set-alerts').checked,
    alertThresholds: [num('set-t1'), num('set-t2')]
      .filter((n) => n >= 1 && n <= 100)
      .sort((a, b) => a - b),
    fireThreshold: fire >= 1 && fire <= 99 ? fire : 90,
  })
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: `20/20 passaram`

- [ ] **Step 7: Verificar na mão que a estimativa muda**

Run: `npm start`, abrir Configurações, alternar entre Pro e Max 20x, salvar.
Expected: a % dos dois medidores muda na hora (Pro tem orçamento 5x menor que Max 5x, então a % sobe), sem reiniciar o app.

- [ ] **Step 8: Commit**

```bash
git add renderer test
git commit -m "feat: seletor de plano nas configuracoes"
```

---

### Task 5: Interface em português BR

**Files:**
- Modify: `renderer/index.html:2,224,225,233,237`
- Modify: `renderer/pet.js` (`fmtTokens`, `fmtReset`, mensagens de erro e login)
- Test: `test/smoke/main.js`

**Interfaces:**
- Consumes: `check()` (Task 2)
- Produces: `fmtTokens(n)` passa a devolver vírgula decimal (`47,2M`); assinatura inalterada

- [ ] **Step 1: Escrever as checagens que falham**

Acrescentar em `test/smoke/main.js`, antes do bloco de impressão:

```js
  // --- portugues BR ---
  check('idioma do documento e pt-BR', (await js(`document.documentElement.lang`)) === 'pt-BR')
  check(
    'numeros usam virgula decimal',
    /\d,\d/.test(await js(`document.getElementById('week-sub').textContent`)),
  )
  // innerText devolve '' para o que esta oculto, entao abrir tudo antes de
  // varrer — senao a checagem passaria por nao ler nada.
  const painel = await js(
    `document.getElementById('gear').click();
     document.body.classList.remove('collapsed');
     [...document.querySelectorAll('#statusline, #limits, #bymodel, #heat, #mini, #settings')]
       .map(n => n.innerText).join(' ')`,
  )
  check('a varredura leu conteudo de verdade', painel.trim().length > 80)
  check(
    'sem palavras em ingles no painel de dados',
    !/\b(idle|session|live|error|now|Checking|Failed)\b/.test(painel),
  )
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:smoke`
Expected: FALHOU em `idioma do documento e pt-BR` e em `numeros usam virgula decimal`

- [ ] **Step 3: Traduzir o HTML**

Modify `renderer/index.html`:

- linha 2: `<html lang="en">` → `<html lang="pt-BR">`
- linha 224: `<span id="mini-text">idle</span>` → `<span id="mini-text">ocioso</span>`
- linha 225: `<span class="lbl">session</span>` → `<span class="lbl">sessão</span>`
- linha 233: `<span id="status-text">idle</span>` → `<span id="status-text">ocioso</span>`
- linha 237: `<span id="live-tag" class="live-only">live</span>` → `<span id="live-tag" class="live-only">ao vivo</span>`

Não tocar nos `<text>` dentro de `#terminal` e `#reading` — são as animações decorativas, que ficam em inglês de propósito.

- [ ] **Step 4: Vírgula decimal em `fmtTokens`**

Modify `renderer/pet.js` — substituir a função (linha 144):

```js
function fmtTokens(t) {
  t = t || 0
  if (t >= 1e9) return `${(t / 1e9).toFixed(2)}B`
  if (t >= 1e6) return `${(t / 1e6).toFixed(1)}M`
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)}k`
  return String(t)
}
```

por:

```js
function fmtTokens(t) {
  t = t || 0
  const dec = (n, casas) => n.toFixed(casas).replace('.', ',')
  if (t >= 1e9) return `${dec(t / 1e9, 2)}B`
  if (t >= 1e6) return `${dec(t / 1e6, 1)}M`
  if (t >= 1e3) return `${dec(t / 1e3, 1)}k`
  return String(t)
}
```

- [ ] **Step 5: Traduzir as strings do `pet.js`**

Modify `renderer/pet.js`:

- em `fmtReset` (linha 152): `return 'now'` → `return 'agora'`
- em `window.api.onError` (linha 563): `el('status-text').textContent = 'error'` → `el('status-text').textContent = 'erro'`
- no handler `set-confirm` (linha 639): `'Checking…'` → `'Verificando…'`
- em `window.api.onAuthResult` (linhas 620-622), substituir:

```js
    el('acc-msg').textContent = /429|rate_limit/i.test(e)
      ? 'Rate limited by Anthropic — wait a few minutes, then try once with a fresh code.'
      : `Failed: ${e || 'check the code and try again'}`
```

por:

```js
    el('acc-msg').textContent = /429|rate_limit/i.test(e)
      ? 'Limite de tentativas da Anthropic — espere alguns minutos e tente uma vez com um código novo.'
      : `Falhou: ${e || 'confira o código e tente de novo'}`
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: `24/24 passaram`

- [ ] **Step 7: Commit**

```bash
git add renderer test
git commit -m "feat: interface e formato numerico em pt-BR"
```

---

### Task 6: Auto-início do Windows reversível

Hoje `main.js:228-230` força o registro na inicialização a cada abertura, sem controle na interface — desmarcar nas Configurações do Windows não adianta, porque o próximo start reativa. O padrão continua **ligado**; o que muda é que desligar passa a funcionar.

**Files:**
- Modify: `config.json`
- Modify: `main.js:23-42` (defaults), `main.js:225-231` (whenReady), `main.js:206-222` (save-config)
- Modify: `renderer/index.html` (painel `#settings`)
- Modify: `renderer/pet.js` (populate, dirty, save)
- Test: `test/smoke/main.js`

**Interfaces:**
- Consumes: `check()` (Task 2), padrão de checkbox de `set-alerts`
- Produces: chave `startWithWindows` (boolean) no config e no patch de `saveConfig`

- [ ] **Step 1: Escrever as checagens que falham**

Acrescentar em `test/smoke/main.js`, antes do bloco de impressão:

```js
  // --- auto-inicio ---
  win.webContents.send('config', { plan: 'max5x', startWithWindows: true, alerts: true, alertThresholds: [80, 95], fireThreshold: 77 })
  await new Promise((r) => setTimeout(r, 200))
  // abrir as configuracoes repopula os campos a partir do config recebido
  await js(`document.getElementById('gear').click()`)
  check('checkbox de auto-inicio reflete o config', await js(`document.getElementById('set-autostart').checked`))
  await js(`document.getElementById('set-autostart').click()`)
  await js(`document.getElementById('set-save').click()`)
  await new Promise((r) => setTimeout(r, 200))
  check(
    'desmarcar auto-inicio chega ao main como false',
    savedConfig && savedConfig.startWithWindows === false,
  )
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:smoke`
Expected: FALHOU em `checkbox de auto-inicio reflete o config` (`#set-autostart` não existe)

- [ ] **Step 3: Adicionar o padrão ao config**

Modify `config.json` — acrescentar a chave depois de `"plan"`:

```json
  "startWithWindows": true,
```

Modify `main.js` — no objeto `defaults` de `loadConfig()` (linha 24), acrescentar depois de `plan: 'max5x',`:

```js
    startWithWindows: true,
```

- [ ] **Step 4: Aplicar a preferência em vez de impor**

Modify `main.js` — substituir o bloco de `app.whenReady()` (linhas 225-231):

```js
app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.datasystem.claude-glass')
  createWindow()
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false })
  }
})
```

por:

```js
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
  applyAutoStart()
})
```

Modify `main.js` — no handler `save-config`, depois de `armed.clear()` e da linha que reenvia o config:

```js
  applyAutoStart()
```

- [ ] **Step 5: Adicionar o checkbox**

Modify `renderer/index.html` — inserir logo depois do `<label class="set-check">` de alertas e da sua `set-hint`:

```html
        <label class="set-check"><input id="set-autostart" type="checkbox" /> Iniciar com o Windows</label>
        <div class="set-hint set-hint-left">Abre o widget sozinho quando você liga o computador.</div>
```

- [ ] **Step 6: Ligar o checkbox no `pet.js`**

Modify `renderer/pet.js`:

a) Em `snapshotSettings()`, incluir a chave:

```js
    autostart: el('set-autostart').checked,
```

b) Em `populateSettings()`, junto das outras atribuições:

```js
  el('set-autostart').checked = c.startWithWindows !== false
```

c) Na lista de ids que acendem o Salvar (linha ~696), incluir o novo campo:

```js
for (const id of ['set-alerts', 'set-autostart', 'set-t1', 'set-t2', 'set-fire']) {
```

d) No patch do `set-save`, incluir:

```js
    startWithWindows: el('set-autostart').checked,
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: `26/26 passaram`

- [ ] **Step 8: Commit**

```bash
git add main.js config.json renderer test
git commit -m "feat: auto-inicio do Windows vira preferencia reversivel"
```

---

### Task 7: README em português e inglês

**Files:**
- Create: `README.md`
- Create: `README.en.md`

**Interfaces:**
- Consumes: nada
- Produces: documentação; nenhum código depende dela

- [ ] **Step 1: Escrever o `README.md`**

Estrutura obrigatória, nesta ordem. Escrever em português BR, tom direto, sem marketing.

1. Título, uma frase de descrição, e a linha de idioma: `[English](README.en.md) · **Português**`
2. **O que é** — widget de desktop que mostra quanto do seu limite do Claude você já usou, lendo os logs locais do Claude Code. Bloco de exemplo do card em texto, como no spec.
3. **Instalação** — duas formas:
   - baixar o `.zip` da aba Releases, extrair, rodar `Claude Glass.exe`
   - rodar do código: `git clone`, `npm install`, `npm start`; empacotar com `npm run dist:win`
   - requisito: Windows 10/11 e Claude Code instalado (é de onde vêm os dados)
4. **Conectar a conta (opcional)** — sem conectar você já vê os tokens exatos e a % estimada; conectando, a % passa a vir da API. Passo a passo: Configurações → Entrar pelo navegador → colar o código.
5. **Segurança e o seu token** — seção com todos os pontos listados no spec, sem suavizar:
   - senha nunca passa pelo app (OAuth PKCE)
   - token em `%USERPROFILE%\.claude-usage-monitor\auth.json`, fora do repositório, nunca commitar
   - o `mode: 0o600` de `auth.js` não protege no Windows (Node só ajusta o atributo somente-leitura, sem ACL)
   - escopo `org:create_api_key user:profile user:inference` — o token autoriza criar API key na organização
   - o app usa o `client_id` e o User-Agent do Claude Code; não é integração registrada, a Anthropic pode bloquear e isso provavelmente contraria os termos de uso
   - como revogar: "Desconectar" apaga o arquivo local; revogação de verdade nas configurações da conta Anthropic
6. **Configurações** — plano, alertas e limiares, pegar fogo em %, iniciar com o Windows
7. **Desinstalação** — fechar o app pelo × ; desmarcar "Iniciar com o Windows" **antes** de apagar (ou remover a entrada em `Win+R` → `shell:startup`); apagar a pasta do app; apagar `%USERPROFILE%\.claude-usage-monitor` e `%USERPROFILE%\.claude-glass`
8. **Como funciona** — lê os `.jsonl` em `~/.claude/projects`, soma tokens por janela de 5h e por 7 dias; a % sem login usa orçamentos estimados
9. **Limitações conhecidas** — os orçamentos do `PLAN_BUDGETS` são calibrações não oficiais (`usage.js:165-167`); só Windows; a janela de 5h é inferida dos logs
10. **Desenvolvimento** — `npm test` (paridade da bridge + smoke de cliques), estrutura dos arquivos
11. **Licença** — MIT

- [ ] **Step 2: Escrever o `README.en.md`**

Tradução do mesmo conteúdo, com a linha de idioma invertida: `**English** · [Português](README.md)`.

Logo abaixo do título, acrescentar o aviso de que a interface do app é em português:

```markdown
> **Note:** the app's interface is in Brazilian Portuguese. This README is translated, the UI is not.
```

- [ ] **Step 3: Conferir os links entre os dois arquivos**

```bash
grep -n "README" README.md README.en.md
```

Expected: `README.md` aponta para `README.en.md` e vice-versa.

- [ ] **Step 4: Commit**

```bash
git add README.md README.en.md
git commit -m "docs: README em portugues e ingles com secao de seguranca"
```

---

### Task 8: Verificação final e novo executável

**Files:**
- Modify: nenhum (só build e verificação)

**Interfaces:**
- Consumes: tudo das tarefas anteriores
- Produces: `dist/win-unpacked/Claude Glass.exe` e `dist/Claude Glass-1.0.0-win.zip` atualizados

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: `26/26 passaram`, sem nenhuma linha `FALHOU`

- [ ] **Step 2: Reempacotar**

Run: `npm run dist:win`
Expected: termina em `building target=zip`

- [ ] **Step 3: Confirmar que o build carrega o código novo**

```bash
node -e "
const s = require('fs').readFileSync('dist/win-unpacked/resources/app.asar').toString('utf8');
for (const [k, v] of Object.entries({
  'seletor de plano': 'set-plan',
  'nota de estimativa': 'limits-est',
  'auto-inicio': 'startWithWindows',
  'pt-BR': 'lang=\"pt-BR\"',
})) console.log(k.padEnd(20), s.includes(v));
"
```

Expected: `true` nas quatro linhas

- [ ] **Step 4: Rodar o executável empacotado e conferir o console**

```bash
unset ELECTRON_RUN_AS_NODE
timeout 18 "./dist/win-unpacked/Claude Glass.exe" --enable-logging=stderr 2>&1 \
  | grep -iE "uncaught|TypeError|not a function" | head
```

Expected: nenhuma saída

- [ ] **Step 5: Conferir o que o repositório tem antes de entregar**

```bash
git status --short
git log --oneline
du -sh .git
```

Expected: árvore limpa, 7 commits, `.git` abaixo de ~5 MB (se estiver na casa das centenas de MB, `dist/` ou `node_modules/` entrou em algum commit e é preciso refazer o histórico antes de publicar)

- [ ] **Step 6: Commit final se houver pendência**

```bash
git status --short
```

Se limpo, não há o que commitar. O `push` fica com a autora:

```bash
git push -u origin main
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Tarefa |
|---|---|
| Medidores sempre visíveis | 3 |
| Tokens exatos sempre exibidos | 3 |
| `~%` estimada sem login, exata com login | 3 |
| `#mini-pct-row` visível sem login | 3 |
| Caso de borda "sem sessão ativa" | 3 (Step 5, `sessActive`) |
| Seletor de plano segmentado | 4 |
| Estado sujo do Salvar inclui o plano | 4 (Step 5b) |
| Traduções de HTML e JS | 5 |
| Vírgula decimal | 5 |
| Animações decorativas em inglês | 5 (Step 3, nota) |
| `.gitignore` | 1 |
| `LICENSE` MIT | 1 |
| Auto-início reversível, padrão ligado | 6 |
| README pt + en com seção de segurança | 7 |
| `npm test` no repositório | 2 |
| Todas as 6 checagens de teste do spec | 2, 3, 4, 5, 6 |

Sem lacunas.

**Consistência de tipos e nomes:** `PLAN_LABELS` é definido na Task 3 (Step 7) e consumido na Task 4 (Step 5c). `check()` e `savedConfig` são definidos na Task 2 (Step 4) e usados nas Tasks 3–6. `applyAutoStart()` é definido e chamado só dentro da Task 6. `#est-plan` é criado na Task 3 (Step 4) e preenchido na Task 3 (Step 7). `est` é local à função `render`.

**Contagem de testes:** 9 (T2) + 7 (T3) + 4 (T4) + 4 (T5) + 2 (T6) = 26. Bate com o esperado na Task 8.

**Testes que não provariam nada — corrigidos no review:**

- T2 verificava `status !== 'idle'` com um `|| true` no fim, o que fazia a checagem passar sempre. Trocado por `#week-sub` conter "tokens", que também sobrevive à tradução da Task 5.
- T3 media visibilidade com `getComputedStyle(el).display`, que ignora ancestrais ocultos. Trocado por `getClientRects().length > 0`, com reset explícito de `settings-open`/`collapsed` antes.
- T5 varria `#settings` para achar inglês, mas o painel fechado devolve `innerText` vazio e a checagem passaria por não ler nada. Agora abre o painel antes e há uma checagem extra de que a varredura leu conteúdo de verdade.
- T6 abria as Configurações antes de enviar o config, então o `populateSettings()` rodava com o valor velho. Reordenado.
