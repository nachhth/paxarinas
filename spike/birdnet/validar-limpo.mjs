// Valida a CANLE LIMPA de punta a punta e compáraa coa do spike.
//
// A canle limpa é: modelo oficial de Cornell coas capas mel retiradas
// (etl/birdnet/converter_espectro.mjs) + mel-espectrograma escrito por nós
// (public/birdnet/melspec.js) + worker de public/birdnet/worker.js.
// Nin unha liña de código sen licenza declarada.
//
// Pasa os mesmos 40 cantos de xeno-canto que `validar.mjs` e contrasta especie
// a especie contra `medicions-validacion.json`. Se algo estivese mal no
// remostrexo, na normalización, na orde das fiestras ou no mapeo de índices, o
// acerto derrubaríase; e se está ben, os postos teñen que coincidir un a un.
//
// Uso:  node validar-limpo.mjs        (PORTO=5199, N=40)
// Saída → medicions-limpo.json

import { createServer } from 'node:http'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const PROXECTO = join(RAIZ, '..', '..')
const PUBLICO = join(PROXECTO, 'public')
const PORTO = Number(process.env.PORTO || 5199)
const N = Number(process.env.N || 40)

// ── Servidor: só o que fai falta, desde public/ do proxecto ──────────────────
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.bin': 'application/octet-stream',
  '.opus': 'audio/ogg', '.txt': 'text/plain; charset=utf-8',
}

const PAXINA = `<!doctype html><meta charset="utf-8"><title>validación</title>
<body><p>Harness de validación. Non é parte da app.</p><script>
const traballador = new Worker('/birdnet/worker.js')
const agardando = []
traballador.onmessage = ({ data }) => {
  if (data.tipo === 'progreso' || data.tipo === 'bytes') return
  const p = agardando.shift()
  if (data.tipo === 'erro') p.reject(new Error(data.codigo + ': ' + data.mensaxe))
  else p.resolve(data)
}
window.pedir = (msg, transfer) => new Promise((resolve, reject) => {
  agardando.push({ resolve, reject }); traballador.postMessage(msg, transfer || [])
})
</script></body>`

const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (ruta === '/' || ruta === '/index.html') {
    res.writeHead(200, { 'Content-Type': TIPOS['.html'] }).end(PAXINA)
    return
  }
  const rel = normalize(ruta).replace(/^[/\\]+/, '')
  const ficheiro = join(PUBLICO, rel)
  if (!ficheiro.startsWith(PUBLICO)) { res.writeHead(403).end('403'); return }
  try {
    const datos = await readFile(ficheiro)
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ficheiro)] || 'application/octet-stream',
      'Content-Length': datos.length,
      'Cache-Control': 'no-store',
    }).end(datos)
  } catch { res.writeHead(404).end(`404 ${rel}`) }
})
await new Promise((r, j) => servidor.listen(PORTO, r).on('error', j))
console.log(`servindo ${PUBLICO} en http://localhost:${PORTO}\n`)

// ── Mostra: exactamente a mesma que validar.mjs ──────────────────────────────
const galegas = JSON.parse(await readFile(join(PUBLICO, 'birdnet', 'galegas.json'), 'utf8'))
const catalogo = JSON.parse(await readFile(join(PROXECTO, 'data', 'especies.json'), 'utf8'))
const porCientifico = new Map(catalogo.especies.map(e => [e.cientifico, e]))
const cantos = new Set(
  (await readdir(join(PUBLICO, 'media', 'cantos'))).filter(f => f.endsWith('.opus')))

const mostra = galegas.especies
  .map(g => ({ ...g, e: porCientifico.get(g.cientifico) }))
  .filter(g => g.e && !g.e.rara && cantos.has(`${g.e.slug}.opus`))
  .sort((a, b) => a.cientifico.localeCompare(b.cientifico))
  .slice(0, N)
  .map(g => ({ i: g.i, cientifico: g.cientifico, slug: g.e.slug, gl: g.e.nomes.gl }))

console.log(`${mostra.length} cantos a probar\n`)

// ── Navegador ────────────────────────────────────────────────────────────────
const navegador = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] })
const paxina = await navegador.newPage()
paxina.on('pageerror', e => console.log('  [pageerror]', e.message))
paxina.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text()) })
await paxina.goto(`http://localhost:${PORTO}/`, { waitUntil: 'load' })

/* eslint-disable no-undef */
const saida = await paxina.evaluate(async ({ mostra, indices }) => {
  const MOSTRAS = 144000
  const { traza } = await pedir({ tipo: 'cargar', backend: null })

  // Mesma medida que a táboa de tempos do spike: ruído sintético, sen micrófono.
  const bancada = {}
  for (const fragmentos of [1, 5]) {
    const b = await pedir({ tipo: 'benchmark', repeticions: 21, fragmentos })
    const orde = (k) => b.tempos.map(t => t[k]).sort((x, y) => x - y)
    const med = (a) => a[Math.floor(a.length / 2)]
    bancada[fragmentos] = {
      total: +med(orde('total')).toFixed(1),
      espectro: +med(orde('espectro')).toFixed(1),
      modelo: +med(orde('modelo')).toFixed(1),
      tensores: b.tensores,
    }
  }

  const filas = []
  for (const e of mostra) {
    try {
      const buf = await (await fetch(`/media/cantos/${e.slug}.opus`)).arrayBuffer()
      // decodeAudioData remostrexa ao ritmo do contexto: pedimos 48 kHz.
      const ac = new OfflineAudioContext(1, 48000, 48000)
      const audio = await ac.decodeAudioData(buf)
      const pcm0 = audio.getChannelData(0)
      const nFrag = Math.max(1, Math.floor(pcm0.length / MOSTRAS))
      const pcm = pcm0.slice(0, nFrag * MOSTRAS)

      const r = await pedir({ tipo: 'predicir', pcm }, [pcm.buffer])

      // Mellor confianza de cada especie galega ao longo dos fragmentos
      const mellor = new Map()
      for (let f = 0; f < r.nFragmentos; f++) {
        for (const i of indices) {
          const c = r.puntuacions[f * r.nClases + i]
          if (!mellor.has(i) || mellor.get(i) < c) mellor.set(i, c)
        }
      }
      const orde = [...mellor.entries()].sort((a, b) => b[1] - a[1])
      const posto = orde.findIndex(([i]) => i === e.i) + 1

      filas.push({
        cientifico: e.cientifico, gl: e.gl, slug: e.slug, fragmentos: nFrag,
        posto, confianza: +(mellor.get(e.i) ?? 0).toFixed(4),
        top1: orde[0][0], top1conf: +orde[0][1].toFixed(4),
        msEspectro: +r.msEspectro.toFixed(1), msModelo: +r.msModelo.toFixed(1),
      })
    } catch (err) {
      filas.push({ cientifico: e.cientifico, slug: e.slug, erro: String(err && err.message || err) })
    }
  }
  return { traza, bancada, filas }
}, { mostra, indices: galegas.especies.map(e => e.i) })
/* eslint-enable no-undef */

await navegador.close()
servidor.close()

// ── Resultados ───────────────────────────────────────────────────────────────
const porIndice = new Map(galegas.especies.map(e => [e.i, e.cientifico]))
const boas = saida.filas.filter(f => !f.erro)
const top = (n) => boas.filter(f => f.posto >= 1 && f.posto <= n).length

console.log(`\nbackend ${saida.traza.backend} · ${saida.traza.gpu}`)
console.log(`carga ${(saida.traza.ms / 1000).toFixed(1)} s · ` +
  `${(saida.traza.bytes / 1048576).toFixed(1)} MB · ` +
  `tensores ${(saida.traza.tensores / 1048576).toFixed(1)} MB`)
console.log(`  modelo ${(saida.traza.pasos.modelo / 1000).toFixed(2)} s · ` +
  `melspec.json ${saida.traza.pasos.melspec.toFixed(0)} ms · ` +
  `quecemento ${(saida.traza.pasos.quecemento / 1000).toFixed(2)} s`)

console.log('\nBancada con ruído sintético (mediana de 21):')
for (const [n, b] of Object.entries(saida.bancada)) {
  console.log(`  ${n} fragmento(s) de 3 s: total ${String(b.total).padStart(6)} ms  ` +
    `(espectrograma ${String(b.espectro).padStart(6)} ms + modelo ${String(b.modelo).padStart(6)} ms)  ` +
    `→ ${(3000 * Number(n) / b.total).toFixed(0)}× tempo real`)
}

console.log(`\nAcerto na posición 1 (entre as ${galegas.especies.length} galegas) . ` +
  `${top(1)}/${boas.length}  (${(100 * top(1) / boas.length).toFixed(1)}%)`)
console.log(`Entre as 3 primeiras ................................ ${top(3)}/${boas.length}  (${(100 * top(3) / boas.length).toFixed(1)}%)`)
console.log(`Entre as 5 primeiras ................................ ${top(5)}/${boas.length}`)

const msEsp = boas.map(f => f.msEspectro).sort((a, b) => a - b)
const msMod = boas.map(f => f.msModelo).sort((a, b) => a - b)
const mediana = (a) => a[Math.floor(a.length / 2)]
console.log(`\nMediana por canto (5 fragmentos): espectrograma ${mediana(msEsp).toFixed(0)} ms ` +
  `· modelo ${mediana(msMod).toFixed(0)} ms`)

// ── Comparación coa canle do spike ───────────────────────────────────────────
let comparacion = null
try {
  const vello = JSON.parse(await readFile(join(RAIZ, 'medicions-validacion.json'), 'utf8'))
  const porEspecie = new Map(vello.filas.map(f => [f.cientifico, f]))
  const filas = []
  let iguais = 0
  let maxDif = 0
  for (const f of boas) {
    const v = porEspecie.get(f.cientifico)
    if (!v || v.erro) continue
    const dif = Math.abs(f.confianza - v.confianza)
    maxDif = Math.max(maxDif, dif)
    if (f.posto === v.postoGalego) iguais++
    filas.push({
      cientifico: f.cientifico,
      postoSpike: v.postoGalego, postoLimpo: f.posto,
      confSpike: v.confianza, confLimpo: f.confianza, dif: +dif.toFixed(4),
    })
  }
  comparacion = {
    comparadas: filas.length, mesmoPosto: iguais,
    maxDiferenzaConfianza: +maxDif.toFixed(4),
    spikeTop1: vello.top1, spikeTop3: vello.top3, filas,
  }
  console.log('\n─── contra a canle do spike (kernels STFT sen licenza) ───')
  console.log(`Mesmo posto en ${iguais}/${filas.length} especies`)
  console.log(`Maior diferenza de confianza: ${maxDif.toFixed(4)}`)
  console.log(`Spike: ${vello.top1}/${vello.probadas} top-1, ${vello.top3}/${vello.probadas} top-3`)
  console.log(`Limpo: ${top(1)}/${boas.length} top-1, ${top(3)}/${boas.length} top-3`)
  const discrepan = filas.filter(f => f.postoSpike !== f.postoLimpo)
  if (discrepan.length) {
    console.log('\nOnde discrepan:')
    for (const d of discrepan) {
      console.log(`  ${d.cientifico.padEnd(30)} spike ${String(d.postoSpike).padStart(3)} → ` +
        `limpo ${String(d.postoLimpo).padStart(3)}   conf ${d.confSpike} → ${d.confLimpo}`)
    }
  }
} catch (e) {
  console.log(`\n(sen medicions-validacion.json: ${e.message})`)
}

await writeFile(join(RAIZ, 'medicions-limpo.json'), JSON.stringify({
  xerado: new Date().toISOString(),
  canle: 'modelo oficial de Cornell sen capa mel + melspec.js propio',
  nota: 'Un canto de 15 s por especie, de xeno-canto. Mostra pequena; non é unha avaliación formal.',
  traza: saida.traza,
  bancada: saida.bancada,
  candidatas: galegas.especies.length,
  probadas: boas.length,
  top1: top(1), top3: top(3), top5: top(5),
  comparacion,
  filas: saida.filas,
}, null, 2))

console.log('\nespecie                          posto   conf.   1ª predición')
for (const f of saida.filas) {
  if (f.erro) { console.log(`${f.cientifico.padEnd(30)}  ERRO  ${f.erro}`); continue }
  console.log(`${f.cientifico.padEnd(30)} ${String(f.posto).padStart(5)} ` +
    `${(100 * f.confianza).toFixed(1).padStart(6)}%   ${porIndice.get(f.top1)} (${(100 * f.top1conf).toFixed(1)}%)`)
}
console.log('\n→ medicions-limpo.json')
