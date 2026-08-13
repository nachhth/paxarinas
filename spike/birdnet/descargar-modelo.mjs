// Descarga o modelo BirdNET convertido a TensorFlow.js dende o repo de referencia
// georg95/birdnet-web (a mesma conversion que usa a demo de Cornell).
// Deixa todo en public/modelo/, que esta gitignorado: NON se versiona.
//
// Modelos BirdNET: CC BY-NC-SA 4.0 (Kahl et al.). Codigo BirdNET-Analyzer: MIT.

import { mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const BASE = 'https://raw.githubusercontent.com/georg95/birdnet-web/main/models/birdnet'
const DESTINO = join(RAIZ, 'public', 'modelo')

// Só as etiquetas que nos interesan: en_uk trae o nome científico e o inglés.
const EXTRA = ['labels/en_uk.txt', 'labels/es.txt']

async function baixar (rutaRelativa) {
  const destino = join(DESTINO, rutaRelativa)
  if (existsSync(destino)) {
    const { size } = await stat(destino)
    return { rutaRelativa, bytes: size, ms: 0, cacheado: true }
  }
  await mkdir(dirname(destino), { recursive: true })
  const t0 = performance.now()
  const resposta = await fetch(`${BASE}/${rutaRelativa}`)
  if (!resposta.ok) throw new Error(`${rutaRelativa}: HTTP ${resposta.status}`)
  const datos = Buffer.from(await resposta.arrayBuffer())
  const ms = performance.now() - t0
  await writeFile(destino, datos)
  return { rutaRelativa, bytes: datos.length, ms, cacheado: false }
}

const mb = (b) => (b / 1048576).toFixed(2)

async function grupo (nome, ficheiros) {
  const resultados = []
  for (const f of ficheiros) {
    const r = await baixar(f)
    resultados.push(r)
    process.stdout.write(
      `  ${r.rutaRelativa.padEnd(34)} ${String(r.bytes).padStart(9)} B` +
      `${r.cacheado ? '  (xa estaba)' : `  ${r.ms.toFixed(0)} ms`}\n`
    )
  }
  const total = resultados.reduce((s, r) => s + r.bytes, 0)
  console.log(`  → ${nome}: ${resultados.length} ficheiros, ${mb(total)} MB\n`)
  return total
}

console.log(`Descargando modelo BirdNET (TFJS) → public/modelo/\n`)

// 1. Modelo principal
const manifesto = await baixar('model.json')
const modelJson = JSON.parse(
  await import('node:fs/promises').then(fs => fs.readFile(join(DESTINO, 'model.json'), 'utf8'))
)
const shards = modelJson.weightsManifest.flatMap(g => g.paths)
console.log('Modelo principal (clasificador de 6.522 especies):')
const bytesModelo = manifesto.bytes + await grupo('modelo', shards)

// 2. Meta-modelo de área (lat, lon, semana → probabilidade por especie)
console.log('Meta-modelo de área (filtro por localización e data):')
const areaJson = await baixar('area-model/model.json')
const areaManifesto = JSON.parse(
  await import('node:fs/promises').then(fs => fs.readFile(join(DESTINO, 'area-model/model.json'), 'utf8'))
)
const areaShards = areaManifesto.weightsManifest.flatMap(g => g.paths).map(p => `area-model/${p}`)
const bytesArea = areaJson.bytes + await grupo('meta-modelo de área', areaShards)

// 3. Etiquetas
console.log('Etiquetas:')
const bytesLabels = await grupo('etiquetas', EXTRA)

const total = bytesModelo + bytesArea + bytesLabels
console.log('─'.repeat(58))
console.log(`Modelo principal    ${mb(bytesModelo).padStart(8)} MB`)
console.log(`Meta-modelo de área ${mb(bytesArea).padStart(8)} MB`)
console.log(`Etiquetas           ${mb(bytesLabels).padStart(8)} MB`)
console.log(`TOTAL               ${mb(total).padStart(8)} MB   (${total} bytes)`)

await writeFile(
  join(RAIZ, 'medicions.json'),
  JSON.stringify({ bytesModelo, bytesArea, bytesLabels, total }, null, 2)
)
