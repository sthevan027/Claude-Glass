// Gera 3 conceitos de icone de app pro Claude Glass, tema "monitoramento de IA",
// mantendo a identidade do pet pixel-art existente (mesmo SPRITE e paleta do
// projeto). Sem libs de imagem: so zlib nativo, igual scripts/gerar-icones-tray.js.
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const OUT_DIR = process.argv[2] || __dirname
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------- PNG writer (RGBA, 8-bit) ----------
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
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ---------- canvas helpers ----------
function makeCanvas(size) {
  return { size, buf: Buffer.alloc(size * size * 4) }
}
function setPx(cv, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return
  const i = (y * cv.size + x) * 4
  // alpha-blend onto existing (so we can layer shapes)
  const existA = cv.buf[i + 3]
  if (a >= 255 || existA === 0) {
    cv.buf[i] = r
    cv.buf[i + 1] = g
    cv.buf[i + 2] = b
    cv.buf[i + 3] = a
  } else {
    const outA = a + (existA * (255 - a)) / 255
    cv.buf[i] = (r * a + cv.buf[i] * existA * (255 - a) / 255) / outA
    cv.buf[i + 1] = (g * a + cv.buf[i + 1] * existA * (255 - a) / 255) / outA
    cv.buf[i + 2] = (b * a + cv.buf[i + 2] * existA * (255 - a) / 255) / outA
    cv.buf[i + 3] = outA
  }
}
function fillRoundedSquare(cv, hex, radiusFrac) {
  const [r, g, b] = hexToRgb(hex)
  const s = cv.size
  const rad = s * radiusFrac
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = x < rad ? rad : x > s - rad ? s - rad : x
      const cy = y < rad ? rad : y > s - rad ? s - rad : y
      const inCorner = (x < rad || x > s - rad) && (y < rad || y > s - rad)
      if (inCorner) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy > rad * rad) continue
      }
      setPx(cv, x, y, r, g, b, 255)
    }
  }
}
function fillCircle(cv, cx, cy, radius, hex, alpha = 255) {
  const [r, g, b] = hexToRgb(hex)
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(cv.size - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(cv.size - 1, Math.ceil(cy + radius))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= radius * radius) setPx(cv, x, y, r, g, b, alpha)
    }
  }
}
function fillRect(cv, x, y, w, h, hex, alpha = 255) {
  const [r, g, b] = hexToRgb(hex)
  for (let yy = Math.max(0, y); yy < Math.min(cv.size, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(cv.size, x + w); xx++) {
      setPx(cv, xx, yy, r, g, b, alpha)
    }
  }
}

// mesmo sprite do pet real (renderer/pet.js)
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

function drawPet(cv, originX, originY, cell, bodyHex, eyeHex) {
  const [br, bg, bb] = hexToRgb(bodyHex)
  const [er, eg, eb] = hexToRgb(eyeHex)
  SPRITE.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '.') continue
      const [pr, pg, pb] = ch === 'o' ? [er, eg, eb] : [br, bg, bb]
      const x = Math.round(originX + c * cell)
      const y = Math.round(originY + r * cell)
      fillRect(cv, x, y, Math.ceil(cell), Math.ceil(cell), rgbToHex(pr, pg, pb))
    }
  })
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

// downsample by box filter N -> M
function downsample(cv, targetSize) {
  const out = makeCanvas(targetSize)
  const ratio = cv.size / targetSize
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx0 = x * ratio
      const sx1 = (x + 1) * ratio
      const sy0 = y * ratio
      const sy1 = (y + 1) * ratio
      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx >= cv.size || sy >= cv.size) continue
          const i = (sy * cv.size + sx) * 4
          r += cv.buf[i]
          g += cv.buf[i + 1]
          b += cv.buf[i + 2]
          a += cv.buf[i + 3]
          count++
        }
      }
      if (count === 0) continue
      const i = (y * targetSize + x) * 4
      out.buf[i] = r / count
      out.buf[i + 1] = g / count
      out.buf[i + 2] = b / count
      out.buf[i + 3] = a / count
    }
  }
  return out
}

// ---------- paleta do projeto (renderer/style.css) ----------
const BG_DARK_1 = '#241a15' // topo do gradiente da cena (aprox)
const BG_DARK_2 = '#110c0a' // base do gradiente da cena
const PET_BODY = '#d57658' // terracota do pet (mesma cor real do logo Claude)
const PET_EYE = '#221b16'
const CORAL = '#d97757' // accent principal do app
const GREEN = '#7ec77d' // usado pra indicar "ok / dentro do limite"
const RED = '#e0553f' // usado pra indicar limite estourado

function bgGradientRoundedSquare(cv, radiusFrac) {
  const [r1, g1, b1] = hexToRgb(BG_DARK_1)
  const [r2, g2, b2] = hexToRgb(BG_DARK_2)
  const s = cv.size
  const rad = s * radiusFrac
  for (let y = 0; y < s; y++) {
    const t = y / s
    const r = r1 + (r2 - r1) * t
    const g = g1 + (g2 - g1) * t
    const b = b1 + (b2 - b1) * t
    for (let x = 0; x < s; x++) {
      const cx = x < rad ? rad : x > s - rad ? s - rad : x
      const cy = y < rad ? rad : y > s - rad ? s - rad : y
      const inCorner = (x < rad || x > s - rad) && (y < rad || y > s - rad)
      if (inCorner) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy > rad * rad) continue
      }
      setPx(cv, x, y, Math.round(r), Math.round(g), Math.round(b), 255)
    }
  }
}

// ---------- Conceito A: "pulso" (linha de EKG sob o pet) ----------
function conceptPulse(size) {
  const cv = makeCanvas(size)
  bgGradientRoundedSquare(cv, 0.22)
  const cell = size * 0.062
  const petW = 10 * cell
  const petH = 9 * cell
  const originX = (size - petW) / 2
  const originY = size * 0.16
  drawPet(cv, originX, originY, cell, PET_BODY, PET_EYE)

  // linha de pulso (EKG) atravessando a base do icone
  const lineY = size * 0.82
  const thickness = Math.max(2, size * 0.028)
  const points = [
    [size * 0.08, lineY],
    [size * 0.32, lineY],
    [size * 0.40, lineY - size * 0.14],
    [size * 0.47, lineY + size * 0.2],
    [size * 0.54, lineY],
    [size * 0.92, lineY],
  ]
  for (let i = 0; i < points.length - 1; i++) {
    drawThickLine(cv, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], thickness, CORAL)
  }
  return cv
}

function drawThickLine(cv, x0, y0, x1, y1, thickness, hex) {
  const [r, g, b] = hexToRgb(hex)
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    fillCircle(cv, x, y, thickness / 2, hex)
  }
}

// ---------- Conceito B: "anel" (gauge de uso ao redor do pet) ----------
function conceptRing(size) {
  const cv = makeCanvas(size)
  bgGradientRoundedSquare(cv, 0.22)
  const cell = size * 0.052
  const petW = 10 * cell
  const petH = 9 * cell
  const originX = (size - petW) / 2
  const originY = (size - petH) / 2 + size * 0.02

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.44
  const trackWidth = size * 0.055
  const progress = 0.72 // 72% "usado" — so decorativo

  for (let a = 0; a < 360; a += 0.5) {
    const rad = (a - 90) * (Math.PI / 180)
    const used = a / 360 <= progress
    const hex = used ? CORAL : '#3a2c22'
    const x = cx + Math.cos(rad) * outerR
    const y = cy + Math.sin(rad) * outerR
    fillCircle(cv, x, y, trackWidth / 2, hex)
  }

  drawPet(cv, originX, originY, cell, PET_BODY, PET_EYE)
  return cv
}

// ---------- Conceito C: "status dot" (selo de monitoramento ativo) ----------
function conceptDot(size) {
  const cv = makeCanvas(size)
  bgGradientRoundedSquare(cv, 0.22)
  const cell = size * 0.072
  const petW = 10 * cell
  const petH = 9 * cell
  const originX = (size - petW) / 2
  const originY = (size - petH) / 2

  drawPet(cv, originX, originY, cell, PET_BODY, PET_EYE)

  // badge verde "monitorando" no canto inferior direito, com anel de contraste
  const bx = size * 0.79
  const by = size * 0.79
  fillCircle(cv, bx, by, size * 0.145, BG_DARK_2)
  fillCircle(cv, bx, by, size * 0.105, GREEN)
  return cv
}

// ---------- render tudo ----------
const CONCEPTS = {
  'a-pulso': conceptPulse,
  'b-anel': conceptRing,
  'c-status': conceptDot,
}
const SIZES = [256, 128, 64, 48, 32, 16]

const manifest = {}
for (const [name, fn] of Object.entries(CONCEPTS)) {
  const base = fn(256)
  manifest[name] = {}
  for (const size of SIZES) {
    const cv = size === 256 ? base : downsample(base, size)
    const png = writePng(size, size, cv.buf)
    const filePath = path.join(OUT_DIR, `icon-${name}-${size}.png`)
    fs.writeFileSync(filePath, png)
    manifest[name][size] = filePath
    console.log('Gerado:', filePath)
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
