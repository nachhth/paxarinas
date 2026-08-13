// Descarga BirdNET v2.4 xa convertido a TensorFlow.js DENDE O REPOSITORIO
// OFICIAL DE CORNELL (birdnet-team/BirdNET-Analyzer), non dende terceiros.
//
//   Código do repositorio ......... MIT (birdnet-team, 2024)
//   Pesos do modelo ............... CC BY-NC-SA 4.0 (Kahl et al.)
//
// A conversión a TFJS é a que publica o propio equipo de BirdNET en
// `birdnet_analyzer/checkpoints/V2.4/BirdNET_GLOBAL_6K_V2.4_Model_TFJS/`.
// Non se toca ningún repositorio sen licenza declarada.
//
// A etiqueta v1.5.1 é a última que leva os checkpoints dentro do repositorio:
// a partir de v2.0.0 BirdNET-Analyzer delega a descarga no paquete `birdnet`.
// Fixamos a etiqueta para que a descarga sexa reproducible.
//
// Uso:  node etl/birdnet/descargar_oficial.mjs [destino]
// Por defecto o destino é etl/birdnet/orixinal/.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))

export const ETIQUETA = 'v1.5.1'
export const BASE =
  `https://raw.githubusercontent.com/birdnet-team/BirdNET-Analyzer/${ETIQUETA}` +
  '/birdnet_analyzer/checkpoints/V2.4/BirdNET_GLOBAL_6K_V2.4_Model_TFJS/static/model'

const DESTINO = process.argv[2] ? process.argv[2] : join(RAIZ, 'orixinal')

async function baixar (rel, destinoBase = DESTINO) {
  const destino = join(destinoBase, rel)
  if (existsSync(destino)) {
    const { size } = await stat(destino)
    return { rel, bytes: size, cacheado: true }
  }
  await mkdir(dirname(destino), { recursive: true })
  const r = await fetch(`${BASE}/${rel}`)
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`)
  const datos = Buffer.from(await r.arrayBuffer())
  await writeFile(destino, datos)
  return { rel, bytes: datos.length, cacheado: false }
}

export async function descargar (destinoBase = DESTINO) {
  const ficheiros = []

  // 1. Modelo principal: manifesto + shards que el mesmo declara
  ficheiros.push(await baixar('model.json', destinoBase))
  const manifesto = JSON.parse(await readFile(join(destinoBase, 'model.json'), 'utf8'))
  for (const p of manifesto.weightsManifest.flatMap(g => g.paths)) {
    ficheiros.push(await baixar(p, destinoBase))
  }

  // 2. Meta-modelo de área (lat, lon, semana → probabilidade por especie)
  ficheiros.push(await baixar('mdata/model.json', destinoBase))
  const mdata = JSON.parse(await readFile(join(destinoBase, 'mdata/model.json'), 'utf8'))
  for (const p of mdata.weightsManifest.flatMap(g => g.paths)) {
    ficheiros.push(await baixar(`mdata/${p}`, destinoBase))
  }

  // 3. Etiquetas oficiais (6.522 clases, "Cientifico_Común")
  ficheiros.push(await baixar('labels.json', destinoBase))

  return ficheiros
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('descargar_oficial.mjs')) {
  console.log(`BirdNET v2.4 (TFJS) dende Cornell, etiqueta ${ETIQUETA}\n→ ${DESTINO}\n`)
  const ficheiros = await descargar()
  let total = 0
  for (const f of ficheiros) {
    total += f.bytes
    console.log(`  ${f.rel.padEnd(28)} ${String(f.bytes).padStart(9)} B${f.cacheado ? '  (xa estaba)' : ''}`)
  }
  console.log(`\nTOTAL ${(total / 1048576).toFixed(2)} MB (${total} bytes)`)

  // Pegada do modelo principal, para poder demostrar que o que servimos é o de Cornell
  const h = createHash('sha256')
  for (const f of ficheiros.filter(f => /^group1-shard/.test(f.rel))) {
    h.update(await readFile(join(DESTINO, f.rel)))
  }
  console.log(`sha256 dos pesos do modelo principal: ${h.digest('hex')}`)
}
