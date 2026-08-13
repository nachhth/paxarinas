// Cruza as 6.522 etiquetas de BirdNET co catálogo galego e escribe
// public/birdnet/galegas.json: o mapa saída-do-modelo → nome científico.
//
// Este é o filtro que fai útil a identificación por son fronte a Merlin: pasar
// de 6.522 candidatas a uns centos. Coa fenoloxía do catálogo, ademais, pódese
// acotar ao mes actual sen descargar o meta-modelo de área de BirdNET (que na
// conversión oficial a TFJS pesa 33,6 MB e non trae nomenclatura galega).
//
// Só se garda o índice e o nome científico: o resto (nome galego, slug, meses)
// xa está no catálogo que a app leva no bundle. Duplicalo aquí sería ter dous
// sitios que poden discrepar.
//
// Uso:  node etl/birdnet/xerar_galegas.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const CATALOGO = join(RAIZ, '..', '..', 'data', 'especies.json')
const ETIQUETAS = join(RAIZ, 'orixinal', 'labels.json')
const DESTINO = join(RAIZ, '..', '..', 'public', 'birdnet')

// BirdNET v2.4 usa a taxonomía de eBird/Clements; o catálogo usa o backbone de
// GBIF. Onde discrepan hai que mapear a man. É unha mostra verificada, non unha
// lista completa: quedan sinónimos por revisar.
const SINONIMOS = {
  'Coloeus monedula': 'Corvus monedula',
  'Parus montanus': 'Poecile montanus',
  'Porzana parva': 'Zapornia parva',
  'Porzana pusilla': 'Zapornia pusilla',
  'Tachymarptis melba': 'Apus melba',
  'Aquila fasciata': 'Hieraaetus fasciatus',
  'Anas carolinensis': 'Anas crecca',
  'Larus smithsonianus': 'Larus argentatus',
}

const catalogo = JSON.parse(await readFile(CATALOGO, 'utf8'))
const etiquetas = JSON.parse(await readFile(ETIQUETAS, 'utf8'))

const porCientifico = new Map()
etiquetas.forEach((l, i) => {
  const [cientifico] = String(l).split('_')
  if (!porCientifico.has(cientifico)) porCientifico.set(cientifico, i)
})

// Primeiro as coincidencias directas e despois os sinónimos, e só se o índice
// segue libre. Se non, dúas especies do catálogo apuntarían á mesma saída do
// modelo (pasa con Anas carolinensis→crecca e Larus smithsonianus→argentatus) e
// a app amosaría un nome galego que non é o que o modelo predí.
const ocupados = new Set()
const orde = [
  ...catalogo.especies.filter(e => porCientifico.has(e.cientifico)),
  ...catalogo.especies.filter(e => !porCientifico.has(e.cientifico)),
]

const especies = []
const senCorrespondencia = []
const colisions = []
let porSinonimo = 0

for (const e of orde) {
  let indice = porCientifico.get(e.cientifico)
  let viaSinonimo = false
  if (indice === undefined && SINONIMOS[e.cientifico]) {
    indice = porCientifico.get(SINONIMOS[e.cientifico])
    viaSinonimo = indice !== undefined
  }
  if (indice === undefined) { senCorrespondencia.push(e.cientifico); continue }
  if (ocupados.has(indice)) {
    colisions.push(`${e.cientifico} → ${SINONIMOS[e.cientifico] || e.cientifico}`)
    continue
  }
  ocupados.add(indice)
  if (viaSinonimo) porSinonimo++
  especies.push({ i: indice, cientifico: e.cientifico })
}

especies.sort((a, b) => a.i - b.i)

await mkdir(DESTINO, { recursive: true })
await writeFile(join(DESTINO, 'galegas.json'), JSON.stringify({
  xerado: new Date().toISOString(),
  fonte: 'Etiquetas de BirdNET GLOBAL 6K v2.4 (Kahl et al., CC BY-NC-SA 4.0) × data/especies.json',
  saidasDoModelo: etiquetas.length,
  catalogo: catalogo.especies.length,
  porSinonimo,
  colisions,
  senCorrespondencia,
  especies,
}))

const habituais = catalogo.especies.filter(e => !e.rara).length
const nomes = new Map(catalogo.especies.map(e => [e.cientifico, e]))
const cubertasHab = especies.filter(e => !nomes.get(e.cientifico)?.rara).length

console.log(`Saídas do modelo .............. ${etiquetas.length}`)
console.log(`Catálogo galego ............... ${catalogo.especies.length}`)
console.log(`Cubertas polo modelo .......... ${especies.length} (${(100 * especies.length / catalogo.especies.length).toFixed(1)}%)`)
console.log(`  delas, por sinónimo ......... ${porSinonimo}`)
console.log(`Habituais cubertas ............ ${cubertasHab}/${habituais} (${(100 * cubertasHab / habituais).toFixed(1)}%)`)
console.log(`Sen correspondencia ........... ${senCorrespondencia.length}`)
console.log(`Descartadas por colisión ...... ${colisions.length}${colisions.length ? ': ' + colisions.join(', ') : ''}`)
console.log(`\nRedución do espazo de busca: ${etiquetas.length} → ${especies.length}` +
  ` (${(100 * especies.length / etiquetas.length).toFixed(1)}% das saídas)`)
