// Proba de punta a punta da páxina /escoitar da APP xa construída, cun
// micrófono falso que reproduce un canto real de xeno-canto.
//
// Isto é o que distingue «está escrito» de «funciona»: percorre permiso de
// micrófono, MediaRecorder, decodificación, remostrexo a 48 kHz, o
// mel-espectrograma en JavaScript, a inferencia, o filtro galego e o pintado
// dos resultados. Se algo desa cadea estivese roto, aquí vese.
//
// Antes:  npx nuxt generate
// Uso:    node probar-app.mjs [slug-da-especie]
//
// Fai falta o WAV porque Chromium só sabe simular o micrófono desde un ficheiro
// WAV, e non hai ffmpeg neste equipo: a primeira fase descodifica o .opus no
// propio navegador e escribe o WAV desde Node.

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const SAIDA = join(RAIZ, '..', '..', '.output', 'public')
const PORTO = Number(process.env.PORTO || 5200)
const SLUG = process.argv[2] || 'alectoris-rufa'
const TMP = join(RAIZ, 'tmp')

if (!existsSync(join(SAIDA, 'index.html'))) {
  console.error('Falta .output/public. Executa antes:  npx nuxt generate')
  process.exit(1)
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const rel = normalize(ruta.replace(/\/$/, '/index.html')).replace(/^[/\\]+/, '')
  let ficheiro = join(SAIDA, rel || 'index.html')
  if (!ficheiro.startsWith(SAIDA)) { res.writeHead(403).end('403'); return }
  // As rutas de Nuxt son carpetas con index.html dentro; `existsSync` daría
  // certo para a carpeta e `readFile` fallaría con 404 enganoso.
  if (!extname(ficheiro) && existsSync(join(ficheiro, 'index.html'))) {
    ficheiro = join(ficheiro, 'index.html')
  }
  try {
    const datos = await readFile(ficheiro)
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ficheiro)] || 'application/octet-stream',
      'Content-Length': datos.length,
    }).end(datos)
  } catch { res.writeHead(404).end(`404 ${rel}`) }
})
await new Promise((r, j) => servidor.listen(PORTO, r).on('error', j))
console.log(`servindo .output/public en http://localhost:${PORTO}`)

// ── Fase 1: .opus → WAV de 16 bits a 48 kHz ─────────────────────────────────
await mkdir(TMP, { recursive: true })
const wav = join(TMP, `${SLUG}.wav`)

{
  const nav = await chromium.launch({ headless: true })
  const px = await nav.newPage()
  await px.goto(`http://localhost:${PORTO}/`, { waitUntil: 'domcontentloaded' })
  /* eslint-disable no-undef */
  const mostras = await px.evaluate(async (slug) => {
    const buf = await (await fetch(`/media/cantos/${slug}.opus`)).arrayBuffer()
    const ac = new OfflineAudioContext(1, 48000, 48000)
    const a = await ac.decodeAudioData(buf)
    return Array.from(a.getChannelData(0))
  }, SLUG)
  /* eslint-enable no-undef */
  await nav.close()

  const n = mostras.length
  const cab = Buffer.alloc(44)
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + n * 2, 4); cab.write('WAVE', 8)
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20)
  cab.writeUInt16LE(1, 22); cab.writeUInt32LE(48000, 24); cab.writeUInt32LE(96000, 28)
  cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34)
  cab.write('data', 36); cab.writeUInt32LE(n * 2, 40)
  const pcm = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mostras[i] * 32767))), i * 2)
  }
  await writeFile(wav, Buffer.concat([cab, pcm]))
  console.log(`micrófono falso: ${SLUG}.wav, ${(n / 48000).toFixed(1)} s`)
}

// ── Fase 2: a páxina de verdade ─────────────────────────────────────────────
const nav = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}%noloop`,
  ],
})
const ctx = await nav.newContext({ permissions: ['microphone'] })
const px = await ctx.newPage()
px.on('pageerror', e => console.log('  [pageerror]', e.message))
px.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text()) })

let fallos = 0
const comproba = (ok, texto) => {
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`)
  if (!ok) fallos++
}

await px.goto(`http://localhost:${PORTO}/escoitar`, { waitUntil: 'load' })
console.log('\n/escoitar')

comproba(await px.getByRole('heading', { name: 'Escoitar' }).isVisible(), 'a páxina carga')
comproba(!(await px.getByText('Este navegador non ten').isVisible().catch(() => false)),
  'detecta que hai GPU')

const botonBaixar = px.getByRole('button', { name: /Baixar o modelo/ })
// `waitFor` e non `isVisible`: comprobar se hai GPU é asíncrono.
await botonBaixar.waitFor({ timeout: 15000 })
comproba(await botonBaixar.isVisible(), 'ofrece baixar o modelo e avisa do peso')
const aviso = await botonBaixar.textContent()
comproba(/\d+[.,]\d+ MB/.test(aviso ?? ''), `di canto pesa: «${aviso?.trim()}»`)

console.log('\nbaixando o modelo…')
const t0 = Date.now()
await botonBaixar.click()
await px.getByRole('button', { name: 'Gravar e identificar' }).waitFor({ timeout: 180000 })
comproba(true, `modelo cargado en ${((Date.now() - t0) / 1000).toFixed(1)} s`)

const candidatas = await px.locator('p.nota', { hasText: 'BirdNET coñece' }).textContent()
console.log(`\n${candidatas?.replace(/\s+/g, ' ').trim()}`)
const n = Number(candidatas?.match(/compáranse só (\d+)/)?.[1] ?? 0)
comproba(n > 100 && n < 500, `o filtro deixa ${n} candidatas (de 6.522)`)

console.log('\ngravando 9 s do micrófono falso…')
await px.getByRole('button', { name: 'Gravar e identificar' }).click()
await px.getByRole('heading', { name: 'O que se escoitou' }).waitFor({ timeout: 120000 })

const filas = await px.locator('.deteccion').all()
console.log(`\n${filas.length} especies detectadas:`)
const nomes = []
for (const f of filas.slice(0, 8)) {
  const t = (await f.textContent())?.replace(/\s+/g, ' ').trim()
  nomes.push(t ?? '')
  console.log(`  ${t}`)
}

comproba(filas.length > 0, 'píntanse resultados')
const cientifico = SLUG.split('-').map((p, i) => i ? p : p[0].toUpperCase() + p.slice(1)).join(' ')
comproba(nomes.some(t => t.includes(cientifico)), `recoñece ${cientifico}`)
comproba(nomes[0]?.includes(cientifico) ?? false, `${cientifico} é a primeira`)

const href = await px.locator('.deteccion').first().getAttribute('href')
comproba(!!href?.startsWith('/especie/'), `a fila liga á ficha (${href})`)
await px.locator('.deteccion').first().click()
await px.waitForURL(/\/especie\//, { timeout: 15000 })
comproba(px.url().includes('/especie/'), `a ligazón funciona (${px.url().replace(/^.*\/especie/, '/especie')})`)

await nav.close()

// ── Fase 3: sen GPU. Ten que dicilo, non quedar morta ───────────────────────
console.log('\nsen WebGL nin WebGPU')
{
  const cego = await chromium.launch({
    headless: true,
    // Sen rasterizador por software non queda ningún contexto WebGL.
    args: ['--disable-gpu', '--disable-software-rasterizer', '--use-gl=disabled',
      '--disable-webgl', '--disable-webgl2'],
  })
  const p = await cego.newPage()
  await p.goto(`http://localhost:${PORTO}/escoitar`, { waitUntil: 'load' })
  const temWebgl = await p.evaluate(() => {
    try { return !!document.createElement('canvas').getContext('webgl') } catch { return false }
  })
  if (!temWebgl) {
    await p.getByText('Aquí non pode funcionar').waitFor({ timeout: 15000 })
    comproba(await p.getByText('Aquí non pode funcionar').isVisible(), 'dise que aquí non funciona')
    comproba(!(await p.getByRole('button', { name: /Baixar o modelo/ }).isVisible().catch(() => false)),
      'non se ofrece baixar 49 MB que non se poderían usar')
    comproba(await p.getByText(/O resto da app/).isVisible(), 'dise que o resto da app segue indo')
  } else {
    console.log('  (saltado: este Chromium segue dando WebGL con esas opcións)')
  }
  await cego.close()
}

servidor.close()

console.log(`\n${fallos ? `✗ ${fallos} comprobacións fallidas` : '✓ todo correcto'}`)
process.exit(fallos ? 1 : 0)
