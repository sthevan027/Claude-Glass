// Gera os icones do tray (bandeja do sistema) como PNG puro, sem depender de
// nenhuma lib de imagem: so `zlib` (nativo do Node) pra comprimir o IDAT.
// Dois estados: trabalhando (cor coral, igual ao pet) e parado (cinza).
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ASSETS_DIR = path.join(__dirname, '..', 'assets')
const SIZE = 32

function crc32Table() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC_TABLE = crc32Table()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function writePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // sem filtro
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Mesmo sprite pixel-art do pet real (renderer/pet.js, const SPRITE) — o
// icone da bandeja usa a MESMA cara do widget, so trocando a cor do corpo
// conforme o estado (igual `body.state-sleeping #body rect` faz no CSS).
const SPRITE = [
  '.########.',
  '.########.',
  '##########',
  '###o##o###',
  '##########',
  '.########.',
  '.########.',
  '.#.#..#.#.',
  '.#.#..#.#.',
]

// Badge de status no canto inferior direito, mesma linguagem do icone do
// app (assets/icon.ico, conceito "Status"): quadrado solido com borda
// escura pra garantir contraste em qualquer tema de barra de tarefas.
// Verde = Claude Code ativo agora; cinza-mudo = parado.
function desenharBadge(buf, size, corBadge) {
  const BORDA = '#1b140f'
  const [bR, bG, bB] = hexToRgb(BORDA)
  const [cR, cG, cB] = hexToRgb(corBadge)
  const badge = Math.round(size * 0.34)
  const borda = Math.max(1, Math.round(size * 0.06))
  const margem = Math.round(size * 0.02)
  const x0 = size - badge - margem
  const y0 = size - badge - margem

  const pintar = (x, y, w, h, r, g, b) => {
    for (let yy = Math.max(0, y); yy < Math.min(size, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(size, x + w); xx++) {
        const i = (yy * size + xx) * 4
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
        buf[i + 3] = 255
      }
    }
  }
  pintar(x0 - borda, y0 - borda, badge + borda * 2, badge + borda * 2, bR, bG, bB)
  pintar(x0, y0, badge, badge, cR, cG, cB)
}

function desenharPet(size, corCorpo, corOlho) {
  const [br, bg, bb] = hexToRgb(corCorpo)
  const [er, eg, eb] = hexToRgb(corOlho)
  const buf = Buffer.alloc(size * size * 4) // zerado = transparente

  const cols = SPRITE[0].length
  const rows = SPRITE.length
  const cell = Math.floor(size / Math.max(cols, rows))
  const offsetX = Math.floor((size - cols * cell) / 2)
  const offsetY = Math.floor((size - rows * cell) / 2)

  SPRITE.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '.') continue
      const [pr, pg, pb] = ch === 'o' ? [er, eg, eb] : [br, bg, bb]
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const x = offsetX + c * cell + dx
          const y = offsetY + r * cell + dy
          if (x < 0 || x >= size || y < 0 || y >= size) continue
          const i = (y * size + x) * 4
          buf[i] = pr
          buf[i + 1] = pg
          buf[i + 2] = pb
          buf[i + 3] = 255
        }
      }
    }
  })
  return buf
}

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })

  // Mesmas cores do CSS: --pixel (corpo acordado) e o tom que
  // `body.state-sleeping #body rect` usa quando o pet esta dormindo.
  const trabalhando = desenharPet(SIZE, '#d57658', '#221b16')
  const parado = desenharPet(SIZE, '#a87e63', '#221b16')

  // badge de status, mesmo par de cores do icone do app (verde ativo /
  // cinza-mudo parado)
  desenharBadge(trabalhando, SIZE, '#7ec77d')
  desenharBadge(parado, SIZE, '#6b6259')

  const caminhoTrabalhando = path.join(ASSETS_DIR, 'tray-working.png')
  const caminhoParado = path.join(ASSETS_DIR, 'tray-idle.png')

  fs.writeFileSync(caminhoTrabalhando, writePng(SIZE, SIZE, trabalhando))
  fs.writeFileSync(caminhoParado, writePng(SIZE, SIZE, parado))

  console.log(`Gerado: ${caminhoTrabalhando}`)
  console.log(`Gerado: ${caminhoParado}`)
}

main()
