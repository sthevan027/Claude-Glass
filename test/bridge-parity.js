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
