// Converte o BirdNET oficial de Cornell nun modelo que come ESPECTROGRAMA en vez
// de audio cru, para que o mel-espectrograma o calculemos nós en JavaScript.
//
// POR QUE
// -------
// O modelo oficial empeza con dúas capas Keras `MelSpecLayerSimple` que fan a
// STFT dentro do grafo. TensorFlow.js non trae un kernel STFT usable en CPU, e a
// implementación de `tf.signal.stft` en WebGL é un DFT O(n²) que tarda máis que
// toda a inferencia. Por iso a demo de terceiros na que se apoiaba o spike
// substituía esa capa por kernels propios en GLSL/WGSL — código sen licenza
// declarada e, polo tanto, non publicable.
//
// Aquí cortamos o problema pola raíz: quitamos as dúas capas do grafo e deixamos
// a rede empezando na BatchNormalization, cunha entrada [null, 96, 511, 2].
// O espectrograma calcúlao `app/utils/melspec.ts`, escrito de cero.
// Resultado: nin unha liña de código alleo sen licenza, e a parte do
// espectrograma deixa de depender de WebGL/WebGPU.
//
// LICENZAS
// --------
//   Pesos e topoloxía ... BirdNET v2.4, Kahl et al., CC BY-NC-SA 4.0.
//                         Este ficheiro produce unha obra derivada: permitida
//                         (uso non comercial), hai que atribuír e compartir igual.
//   Este script ......... a licenza do proxecto.
//
// QUE ESCRIBE (en public/birdnet/, que vai fóra do precache)
// ---------------------------------------------------------
//   modelo/model.json + group1-shard*.bin   o clasificador sen capa mel
//   melspec.json                            parámetros e bancos de filtros mel
//
// Uso:  node etl/birdnet/converter_espectro.mjs
//       node etl/birdnet/descargar_oficial.mjs   (antes, para ter orixinal/)

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const ORIXE = join(RAIZ, 'orixinal')
const DESTINO = join(RAIZ, '..', '..', 'public', 'birdnet')

// 3 s a 48 kHz: a fiestra que espera BirdNET.
const MOSTRAS = 144000

// Nomes das capas que se eliminan. A entrada nova enchúfase onde estaba a saída
// da concatenación.
const A_ELIMINAR = ['INPUT', 'MEL_SPEC1', 'MEL_SPEC2', 'concatenate']
const NOVA_ENTRADA = 'ESPECTRO'
const PRIMEIRA_QUE_QUEDA = 'BNORM_SPEC_NOQUANT'

if (!existsSync(join(ORIXE, 'model.json'))) {
  console.error('Falta etl/birdnet/orixinal/. Executa antes:\n  node etl/birdnet/descargar_oficial.mjs')
  process.exit(1)
}

const modelo = JSON.parse(await readFile(join(ORIXE, 'model.json'), 'utf8'))
const cfg = modelo.modelTopology.model_config.config
const capas = cfg.layers

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ler os pesos e sacar os dous escalares `magnitude_scaling`
// ─────────────────────────────────────────────────────────────────────────────
const grupo = modelo.weightsManifest[0]
const cru = Buffer.concat(await Promise.all(grupo.paths.map(p => readFile(join(ORIXE, p)))))

const posicions = new Map()
let desprazamento = 0
for (const w of grupo.weights) {
  if (w.dtype !== 'float32') throw new Error(`dtype inesperado en ${w.name}: ${w.dtype}`)
  const n = w.shape.reduce((a, b) => a * b, 1)
  posicions.set(w.name, [desprazamento, n])
  desprazamento += n * 4
}
if (desprazamento !== cru.length) {
  throw new Error(`os shards suman ${cru.length} B pero o manifesto declara ${desprazamento} B`)
}

const escalar = (nome) => {
  const p = posicions.get(nome)
  if (!p) throw new Error(`non atopo o peso ${nome}`)
  return cru.readFloatLE(p[0])
}

// spec = spec ^ (1 / (1 + exp(magScale))). O valor está adestrado: NON é o 1.23
// do inicializador, e usar o 1.23 cambiaría todas as predicións.
const magScale1 = escalar('MEL_SPEC1/magnitude_scaling')
const magScale2 = escalar('MEL_SPEC2/magnitude_scaling')

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bancos de filtros mel → representación esparsa
// ─────────────────────────────────────────────────────────────────────────────
// O banco é unha matriz [bins_fft, 96] de triángulos: cada columna (banda mel)
// só ten valores distintos de cero nun tramo contiguo de bins. Gardar iso denso
// serían 590 kB e 75 millóns de multiplicacións por fragmento; esparso son
// ~40 kB e ~1,5 millóns.
function esparso (banco) {
  const nBins = banco.length
  const nBandas = banco[0].length
  const bandas = []
  let nnz = 0
  for (let b = 0; b < nBandas; b++) {
    let inicio = -1; let fin = -1
    for (let i = 0; i < nBins; i++) {
      if (banco[i][b] !== 0) { if (inicio < 0) inicio = i; fin = i }
    }
    if (inicio < 0) { bandas.push({ inicio: 0, pesos: [] }); continue }
    const pesos = []
    for (let i = inicio; i <= fin; i++) pesos.push(banco[i][b])
    bandas.push({ inicio, pesos })
    nnz += pesos.length
  }
  return { nBins, nBandas, bandas, nnz }
}

const mel = []
for (const nome of ['MEL_SPEC1', 'MEL_SPEC2']) {
  const c = capas.find(l => l.name === nome).config
  const banco = esparso(c.mel_filterbank)
  if (banco.nBins !== c.frame_length / 2 + 1) {
    throw new Error(`${nome}: o banco ten ${banco.nBins} bins e a fiestra é de ${c.frame_length}`)
  }
  mel.push({
    nome,
    sampleRate: c.sample_rate,
    frameLength: c.frame_length,
    frameStep: c.frame_step,
    fmin: c.fmin,
    fmax: c.fmax,
    bandas: banco.nBandas,
    // Non se usa `spec_shape` do config: di [96, 512] pero a STFT sen recheo dá
    // 511 fotogramas. O que manda é a conta real.
    fotogramas: Math.floor((MOSTRAS - c.frame_length) / c.frame_step) + 1,
    magScale: nome === 'MEL_SPEC1' ? magScale1 : magScale2,
    filtro: banco,
  })
}

const fotogramas = mel[0].fotogramas
if (mel.some(m => m.fotogramas !== fotogramas)) {
  throw new Error('as dúas capas mel dan distinto número de fotogramas: non se poden concatenar')
}
const FORMA = [mel[0].bandas, fotogramas, 2]

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reescribir a topoloxía
// ─────────────────────────────────────────────────────────────────────────────
const quedan = capas.filter(l => !A_ELIMINAR.includes(l.name))
if (quedan.length !== capas.length - A_ELIMINAR.length) {
  throw new Error('a topoloxía non ten as capas que esperaba')
}
if (quedan[0].name !== PRIMEIRA_QUE_QUEDA) {
  throw new Error(`esperaba ${PRIMEIRA_QUE_QUEDA} como primeira capa e atopei ${quedan[0].name}`)
}

const entrada = {
  class_name: 'InputLayer',
  config: {
    batch_input_shape: [null, ...FORMA],
    dtype: 'float32',
    sparse: false,
    ragged: false,
    name: NOVA_ENTRADA,
  },
  name: NOVA_ENTRADA,
  inbound_nodes: [],
}

// A BatchNormalization colgaba de `concatenate`; agora colga da entrada.
quedan[0] = {
  ...quedan[0],
  inbound_nodes: [[[NOVA_ENTRADA, 0, 0, {}]]],
}

cfg.layers = [entrada, ...quedan]
cfg.input_layers = [[NOVA_ENTRADA, 0, 0]]

// Ninguén máis pode referirse ás capas borradas.
const referencias = JSON.stringify(cfg.layers)
for (const nome of A_ELIMINAR) {
  if (referencias.includes(`"${nome}"`)) throw new Error(`aínda hai referencias a ${nome}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reescribir os pesos sen os dous escalares mel
// ─────────────────────────────────────────────────────────────────────────────
const quedanPesos = grupo.weights.filter(w => !w.name.startsWith('MEL_SPEC'))
if (quedanPesos.length !== grupo.weights.length - 2) {
  throw new Error('esperaba exactamente dous pesos MEL_SPEC')
}

const anacos = quedanPesos.map(w => {
  const [off, n] = posicions.get(w.name)
  return cru.subarray(off, off + n * 4)
})
const novosBytes = Buffer.concat(anacos)

const TAMANO_SHARD = 4 * 1024 * 1024
const rutas = []
const total = Math.ceil(novosBytes.length / TAMANO_SHARD)

await rm(join(DESTINO, 'modelo'), { recursive: true, force: true })
await mkdir(join(DESTINO, 'modelo'), { recursive: true })

for (let i = 0; i < total; i++) {
  const nome = `group1-shard${i + 1}of${total}.bin`
  await writeFile(
    join(DESTINO, 'modelo', nome),
    novosBytes.subarray(i * TAMANO_SHARD, (i + 1) * TAMANO_SHARD)
  )
  rutas.push(nome)
}

modelo.weightsManifest = [{ paths: rutas, weights: quedanPesos }]
modelo.convertedBy =
  `${modelo.convertedBy} · capas mel retiradas por etl/birdnet/converter_espectro.mjs`

await writeFile(join(DESTINO, 'modelo', 'model.json'), JSON.stringify(modelo))

// ─────────────────────────────────────────────────────────────────────────────
// 5. Parámetros do espectrograma para o JavaScript
// ─────────────────────────────────────────────────────────────────────────────
await writeFile(join(DESTINO, 'melspec.json'), JSON.stringify({
  fonte: 'BirdNET GLOBAL 6K v2.4 (Kahl et al.), CC BY-NC-SA 4.0',
  mostras: MOSTRAS,
  sampleRate: mel[0].sampleRate,
  forma: FORMA,
  canles: mel.map(m => ({
    nome: m.nome,
    frameLength: m.frameLength,
    frameStep: m.frameStep,
    fotogramas: m.fotogramas,
    fmin: m.fmin,
    fmax: m.fmax,
    // expoñente = 1 / (1 + exp(magScale)), precalculado para non arrastrar
    // o escalar cru ata o navegador.
    magScale: m.magScale,
    expoñente: 1 / (1 + Math.exp(m.magScale)),
    filtro: {
      nBins: m.filtro.nBins,
      nBandas: m.filtro.nBandas,
      bandas: m.filtro.bandas,
    },
  })),
}))

// ─────────────────────────────────────────────────────────────────────────────
const mb = (b) => (b / 1048576).toFixed(2)
const bytesMelspec = (await readFile(join(DESTINO, 'melspec.json'))).length
const bytesManifesto = (await readFile(join(DESTINO, 'modelo', 'model.json'))).length

console.log('Modelo BirdNET sen capa mel')
console.log('─'.repeat(60))
console.log(`Entrada          ${NOVA_ENTRADA} [null, ${FORMA.join(', ')}]`)
console.log(`Capas            ${capas.length} → ${cfg.layers.length}`)
console.log(`Pesos            ${grupo.weights.length} → ${quedanPesos.length}`)
for (const m of mel) {
  console.log(`${m.nome.padEnd(16)} fiestra ${m.frameLength}, salto ${m.frameStep}, ` +
    `${m.fotogramas} fotogramas, ${m.bandas} bandas, ${m.fmin}–${m.fmax} Hz`)
  console.log(`                 magScale ${m.magScale.toFixed(6)} → expoñente ` +
    `${(1 / (1 + Math.exp(m.magScale))).toFixed(6)}`)
  console.log(`                 banco ${m.filtro.nBins}×${m.filtro.nBandas}, ` +
    `${m.filtro.nnz} valores non nulos ` +
    `(${(100 * m.filtro.nnz / (m.filtro.nBins * m.filtro.nBandas)).toFixed(1)}%)`)
}
console.log('─'.repeat(60))
console.log(`model.json       ${mb(bytesManifesto).padStart(7)} MB  (o orixinal eran ` +
  `${mb((await readFile(join(ORIXE, 'model.json'))).length)} MB: os bancos mel ían dentro)`)
console.log(`pesos            ${mb(novosBytes.length).padStart(7)} MB  en ${total} shards`)
console.log(`melspec.json     ${mb(bytesMelspec).padStart(7)} MB`)
console.log(`TOTAL            ${mb(bytesManifesto + novosBytes.length + bytesMelspec).padStart(7)} MB`)
console.log(`\n→ ${DESTINO}`)
