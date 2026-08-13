import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const RAIZ = process.argv[2]
const DESTINO = process.argv[3]
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

const servidor = createServer(async (req, res) => {
  let p = join(RAIZ, decodeURIComponent(req.url.split('?')[0]))
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(RAIZ, '404.html') }
  try {
    const c = await readFile(p)
    res.writeHead(200, { 'Content-Type': TIPOS[extname(p)] ?? 'application/octet-stream' })
    res.end(c)
  } catch { res.writeHead(404); res.end('x') }
})
await new Promise(r => servidor.listen(4535, r))

const nav = await chromium.launch()

// Listado: comprobar que as miniaturas verticais amosan a cabeza.
const c1 = await nav.newContext({ viewport: { width: 1000, height: 620 }, colorScheme: 'dark' })
const p1 = await c1.newPage()
await p1.goto('http://localhost:4535/?orde=Accipitriformes', { waitUntil: 'networkidle' })
await p1.screenshot({ path: `${DESTINO}/crop-listado.png` })
await c1.close()

// Ficha do gabián: a foto é 500x750, o caso que se vía recortado.
const c2 = await nav.newContext({ viewport: { width: 900, height: 900 }, colorScheme: 'dark' })
const p2 = await c2.newPage()
await p2.goto('http://localhost:4535/especie/accipiter-nisus/', { waitUntil: 'networkidle' })
const m = await p2.evaluate(() => {
  const i = document.querySelector('.foto img')
  const r = i.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), nat: `${i.naturalWidth}x${i.naturalHeight}` }
})
console.log(`ficha: imaxe amosada ${m.w}x${m.h}, orixinal ${m.nat}`)
await p2.screenshot({ path: `${DESTINO}/crop-ficha.png` })
await c2.close()

await nav.close()
servidor.close()
