// Comproba que a canalizacion completa identifica de verdade, e canto axuda o
// filtro galego. Colle os cantos de xeno-canto que xa ten o catalogo
// (public/media/cantos/, SO LECTURA), pasaos polo modelo no navegador e mira
// en que posto queda a especie correcta:
//
//   - entre as 6.522 clases do modelo (sen filtrar)
//   - entre as 465 galegas (co filtro aplicado)
//
// Non e unha avaliacion cientifica: os cantos son de 15 s, un por especie,
// escollidos por proximidade xeografica e non por limpeza. Serve para saber se
// isto funciona ou non, non para publicar unha taxa de acerto.
//
// Resultado → medicions-validacion.json

import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const PORTO = Number(process.env.PORTO || 5199)
const N = Number(process.env.N || 40) // cantos a probar

const galegas = JSON.parse(await readFile(join(RAIZ, 'public', 'galegas.json'), 'utf8'))
const dispoñibles = new Set(
  (await readdir(join(RAIZ, '..', '..', 'public', 'media', 'cantos'))).filter(f => f.endsWith('.opus'))
)

// Especies habituais, con canto e cubertas polo modelo. Collemos as N primeiras
// por orde alfabética para que a mostra sexa reproducible, non escollida a dedo.
const mostra = galegas.especies
  .filter(e => !e.rara && dispoñibles.has(`${e.slug}.opus`))
  .sort((a, b) => a.cientifico.localeCompare(b.cientifico))
  .slice(0, N)

console.log(`${mostra.length} cantos a probar (de ${dispoñibles.size} dispoñibles)\n`)

const servidor = spawn(process.execPath, [join(RAIZ, 'servidor.mjs')], {
  env: { ...process.env, PORTO: String(PORTO) }, stdio: ['ignore', 'inherit', 'inherit']
})
let vivo = false
for (let i = 0; i < 40 && !vivo; i++) {
  if (servidor.exitCode !== null) throw new Error(`o servidor morreu. Porto ${PORTO} ocupado?`)
  try { vivo = (await fetch(`http://localhost:${PORTO}/galegas.json`)).ok } catch { await new Promise(r => setTimeout(r, 250)) }
}
if (!vivo) { servidor.kill(); throw new Error('o servidor non respondeu') }

const navegador = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] })
const paxina = await navegador.newPage()
paxina.on('pageerror', e => console.log('  [pageerror]', e.message))
await paxina.goto(`http://localhost:${PORTO}`, { waitUntil: 'domcontentloaded' })

/* eslint-disable no-undef */
const saida = await paxina.evaluate(async (mostra) => {
  const MOSTRAS = 144000
  const g = await (await fetch('/galegas.json')).json()
  await pedir({ tipo: 'cargar', backend: null, etiquetas: g.especies })

  const filas = []
  for (const e of mostra) {
    try {
      const buf = await (await fetch(`/cantos/${e.slug}.opus`)).arrayBuffer()
      // decodeAudioData remostrexa ao ritmo do contexto: pedimos 48 kHz.
      const ac = new OfflineAudioContext(1, 48000, 48000)
      const audio = await ac.decodeAudioData(buf)
      const pcm0 = audio.getChannelData(0)
      const nFrag = Math.max(1, Math.floor(pcm0.length / MOSTRAS))
      const pcm = pcm0.slice(0, nFrag * MOSTRAS)

      // limiar 0 → devolve todas as galegas, así podemos calcular postos
      const r = await pedir({ tipo: 'predicir', pcm, limiar: 0 })

      // Posto entre as galegas: r.resultados xa vén ordenado por confianza,
      // pero repite especie por fragmento; quedamos coa mellor de cada unha.
      const mellor = new Map()
      for (const x of r.resultados) {
        if (!mellor.has(x.i) || mellor.get(x.i).confianza < x.confianza) mellor.set(x.i, x)
      }
      const orde = [...mellor.values()].sort((a, b) => b.confianza - a.confianza)
      const postoGalego = orde.findIndex(x => x.i === e.i) + 1
      const conf = orde.find(x => x.i === e.i)?.confianza ?? 0

      filas.push({
        cientifico: e.cientifico, gl: e.gl, slug: e.slug, fragmentos: nFrag,
        postoGalego, confianza: +conf.toFixed(4),
        top1: orde[0]?.cientifico, top1conf: +(orde[0]?.confianza ?? 0).toFixed(4),
        ms: +r.ms.toFixed(1)
      })
    } catch (err) {
      filas.push({ cientifico: e.cientifico, slug: e.slug, erro: err.message })
    }
  }
  return filas
}, mostra)
/* eslint-enable no-undef */

await navegador.close()
servidor.kill()

const boas = saida.filter(f => !f.erro)
const top1 = boas.filter(f => f.postoGalego === 1).length
const top3 = boas.filter(f => f.postoGalego >= 1 && f.postoGalego <= 3).length
const top5 = boas.filter(f => f.postoGalego >= 1 && f.postoGalego <= 5).length

const resultado = {
  xerado: new Date().toISOString(),
  nota: 'Un canto de 15 s por especie, de xeno-canto. Mostra pequena; non é unha avaliación formal.',
  probadas: boas.length, erros: saida.filter(f => f.erro),
  top1, top3, top5,
  taxaTop1: +(100 * top1 / boas.length).toFixed(1),
  taxaTop3: +(100 * top3 / boas.length).toFixed(1),
  filas: saida
}
await writeFile(join(RAIZ, 'medicions-validacion.json'), JSON.stringify(resultado, null, 2))

console.log(`\nAcerto na posición 1 (entre as galegas) . ${top1}/${boas.length}  (${resultado.taxaTop1}%)`)
console.log(`Entre as 3 primeiras .................... ${top3}/${boas.length}  (${resultado.taxaTop3}%)`)
console.log(`Entre as 5 primeiras .................... ${top5}/${boas.length}`)
console.log('\nespecie                          posto   conf.   1ª predición')
for (const f of saida) {
  if (f.erro) { console.log(`${f.cientifico.padEnd(30)}  ERRO  ${f.erro}`); continue }
  console.log(
    `${f.cientifico.padEnd(30)} ${String(f.postoGalego).padStart(5)} ` +
    `${(100 * f.confianza).toFixed(1).padStart(6)}%   ${f.top1} (${(100 * f.top1conf).toFixed(1)}%)`
  )
}
console.log('\n→ medicions-validacion.json')
