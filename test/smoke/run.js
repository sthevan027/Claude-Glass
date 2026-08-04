// Lanca o smoke test em Electron com ELECTRON_RUN_AS_NODE removido: em
// terminais dentro do VS Code essa variavel vem setada e faz o binario do
// Electron rodar como Node puro, quebrando o app em main.js:120.
const { spawnSync } = require('node:child_process')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const electron = require('electron') // caminho do binario
const r = spawnSync(electron, [__dirname], { env, stdio: 'inherit' })
process.exit(r.status === null ? 1 : r.status)
