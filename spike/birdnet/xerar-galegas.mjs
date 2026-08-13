// Le (en SO LECTURA) data/especies.json do proxecto e as etiquetas de BirdNET,
// e xera public/galegas.json: o mapa índice-de-BirdNET → especie galega.
//
// Isto e o filtro do spike: das 6.522 saidas do modelo quedamonos so coas que
// teñen cita en Galicia. Levamos tamen a fenoloxia mensual para poder filtrar
// por mes sen depender do meta-modelo de area.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const CATALOGO = join(RAIZ, '..', '..', 'data', 'especies.json')
const ETIQUETAS = join(RAIZ, 'public', 'modelo', 'labels', 'en_uk.txt')

// BirdNET v2.4 usa a taxonomia de eBird/Clements; o catalogo usa o backbone de
// GBIF. Onde discrepan hai que mapear a man. Isto e unha mostra verificada,
// non unha lista completa: quedan sinonimos por revisar.
const SINONIMOS = {
  'Coloeus monedula': 'Corvus monedula',
  'Parus montanus': 'Poecile montanus',
  'Porzana parva': 'Zapornia parva',
  'Porzana pusilla': 'Zapornia pusilla',
  'Tachymarptis melba': 'Apus melba',
  'Aquila fasciata': 'Hieraaetus fasciatus',
  'Anas carolinensis': 'Anas crecca',
  'Larus smithsonianus': 'Larus argentatus'
}

const catalogo = JSON.parse(await readFile(CATALOGO, 'utf8'))
const liñas = (await readFile(ETIQUETAS, 'utf8')).split('\n').map(l => l.trim()).filter(Boolean)

const porCientifico = new Map()
liñas.forEach((l, i) => {
  const [cientifico, comun] = l.split('_')
  porCientifico.set(cientifico, { indice: i, comun })
})

const especies = []
const senCorrespondencia = []
const colisions = []
let porSinonimo = 0

// Primeiro as coincidencias directas; despois os sinónimos, e SÓ se o índice
// segue libre. Se non, dúas especies do catálogo apuntarían á mesma saída do
// modelo (pasa con Anas carolinensis→crecca e Larus smithsonianus→argentatus)
// e a app amosaría un nome galego que non é o que o modelo predí.
const ocupados = new Set()
const orde = [
  ...catalogo.especies.filter(e => porCientifico.has(e.cientifico)),
  ...catalogo.especies.filter(e => !porCientifico.has(e.cientifico))
]

for (const e of orde) {
  let entrada = porCientifico.get(e.cientifico)
  let viaSinonimo = false
  if (!entrada && SINONIMOS[e.cientifico]) {
    entrada = porCientifico.get(SINONIMOS[e.cientifico])
    viaSinonimo = !!entrada
  }
  if (!entrada) { senCorrespondencia.push(e.cientifico); continue }
  if (ocupados.has(entrada.indice)) {
    colisions.push(`${e.cientifico} → ${SINONIMOS[e.cientifico] || e.cientifico} (índice xa ocupado)`)
    continue
  }
  ocupados.add(entrada.indice)
  if (viaSinonimo) porSinonimo++
  especies.push({
    i: entrada.indice,
    cientifico: e.cientifico,
    gl: e.nomes?.gl || null,
    es: e.nomes?.es || null,
    en: entrada.comun,
    slug: e.slug,
    rara: !!e.rara,
    // fenoloxia: 12 valores de ocorrencias por mes; null se non e fiable
    meses: e.fenoloxia?.fiable ? e.fenoloxia.meses : null
  })
}

especies.sort((a, b) => a.i - b.i)

await writeFile(
  join(RAIZ, 'public', 'galegas.json'),
  JSON.stringify({
    xerado: new Date().toISOString(),
    etiquetasBirdNET: liñas.length,
    catalogo: catalogo.especies.length,
    cubertas: especies.length,
    porSinonimo,
    colisions,
    senCorrespondencia,
    especies
  })
)

const habituais = catalogo.especies.filter(e => !e.rara)
const cubertasHab = especies.filter(e => !e.rara).length

console.log(`Etiquetas de BirdNET .......... ${liñas.length}`)
console.log(`Catalogo galego ............... ${catalogo.especies.length}`)
console.log(`Cubertas polo modelo .......... ${especies.length} (${(100 * especies.length / catalogo.especies.length).toFixed(1)}%)`)
console.log(`  delas, por sinonimo ......... ${porSinonimo}`)
console.log(`Habituais cubertas ............ ${cubertasHab}/${habituais.length} (${(100 * cubertasHab / habituais.length).toFixed(1)}%)`)
console.log(`Sen correspondencia ........... ${senCorrespondencia.length}`)
console.log(`Descartadas por colision ...... ${colisions.length}${colisions.length ? ': ' + colisions.join(', ') : ''}`)
console.log(`Con fenoloxia fiable .......... ${especies.filter(e => e.meses).length}`)
console.log(`\nReducion do espazo de busca: ${liñas.length} → ${especies.length} especies` +
  ` (${(100 * especies.length / liñas.length).toFixed(1)}% das saidas do modelo)`)

// Acotado adicional por mes coa fenoloxia do catalogo. As especies sen
// fenoloxia fiable NON se descartan: descartalas sería inventar.
const MESES = ['xan', 'feb', 'mar', 'abr', 'mai', 'xuñ', 'xul', 'ago', 'set', 'out', 'nov', 'dec']
const porMes = MESES.map((m, i) => ({
  mes: m, n: especies.filter(e => !e.meses || e.meses[i] > 0).length
}))
console.log('\nCandidatas por mes (fenoloxia do catalogo):')
console.log(porMes.map(p => `  ${p.mes} ${String(p.n).padStart(4)}`).join('\n'))
