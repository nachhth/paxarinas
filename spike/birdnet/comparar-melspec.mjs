// Contrasta o mel-espectrograma escrito por nós (public/birdnet/melspec.js)
// coa implementación oficial de Cornell (MelSpecLayerSimple, MIT), executada
// aquí con TensorFlow.js en CPU.
//
// Isto é a proba que decide se a canle limpa é equivalente á do spike: se o
// espectrograma coincide, todo o que vén despois é literalmente a mesma rede
// cos mesmos pesos.
//
// Uso:  node comparar-melspec.mjs

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tf from '@tensorflow/tfjs'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const BIRDNET = join(RAIZ, '..', '..', 'public', 'birdnet')

await tf.setBackend('cpu')
await tf.ready()

// ── A nosa implementación ────────────────────────────────────────────────────
const fonte = await readFile(join(BIRDNET, 'melspec.js'), 'utf8')
const ambito = {}
new Function('self', 'module', fonte)(ambito, {})
const Melspec = ambito.Melspec

const params = JSON.parse(await readFile(join(BIRDNET, 'melspec.json'), 'utf8'))
const preparado = Melspec.preparar(params)

// ── A oficial, tal cal está en BirdNET-Analyzer/.../static/main.js ───────────
// Reconstrúense os bancos densos desde a representación esparsa, para que a
// comparación non dependa tamén de que a compresión estea ben.
function bancoDenso (filtro) {
  const m = Array.from({ length: filtro.nBins }, () => new Float32Array(filtro.nBandas))
  filtro.bandas.forEach((banda, b) => {
    banda.pesos.forEach((p, k) => { m[banda.inicio + k][b] = p })
  })
  return tf.tensor2d(m.map(f => Array.from(f)))
}

const bancos = params.canles.map(c => bancoDenso(c.filtro))

function oficial (pcm) {
  return tf.tidy(() => {
    const canles = params.canles.map((c, idx) => {
      let entrada = tf.tensor1d(pcm)
      entrada = tf.sub(entrada, tf.min(entrada, -1, true))
      entrada = tf.div(entrada, tf.max(entrada, -1, true).add(0.000001))
      entrada = tf.sub(entrada, 0.5)
      entrada = tf.mul(entrada, 2.0)

      let spec = tf.signal.stft(
        entrada, c.frameLength, c.frameStep, c.frameLength, tf.signal.hannWindow
      )
      spec = tf.cast(spec, 'float32')            // descarta a parte imaxinaria
      spec = tf.matMul(spec, bancos[idx])
      spec = spec.pow(2.0)
      spec = spec.pow(tf.scalar(1 / (1 + Math.exp(c.magScale))))
      spec = tf.reverse(spec, -1)
      spec = tf.transpose(spec)
      return spec.expandDims(-1)
    })
    return tf.concat(canles, -1).expandDims(0)
  })
}

// ── Sinais de proba ──────────────────────────────────────────────────────────
function ruido (n, semente = 1) {
  // Xerador propio para que a proba sexa reproducible entre execucións.
  let s = semente
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    a[i] = (s / 0x7fffffff) * 2 - 1
  }
  return a
}

function tons (n, frecuencias) {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = 0
    for (const f of frecuencias) v += Math.sin((2 * Math.PI * f * i) / 48000)
    a[i] = v / frecuencias.length
  }
  return a
}

const MOSTRAS = params.mostras
const casos = [
  ['ruído branco', ruido(MOSTRAS)],
  ['tons 1/4/9 kHz', tons(MOSTRAS, [1000, 4000, 9000])],
  ['ton 2 kHz con envolvente', (() => {
    const a = tons(MOSTRAS, [2000])
    for (let i = 0; i < MOSTRAS; i++) a[i] *= 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 12000)
    return a
  })()],
  ['silencio con clic', (() => {
    const a = new Float32Array(MOSTRAS)
    a[70000] = 1
    a[70001] = -1
    return a
  })()],
]

// ── Comparación ──────────────────────────────────────────────────────────────
let peorRel = 0
let algunhaMal = false

console.log(`Forma esperada: [1, ${params.forma.join(', ')}]\n`)

for (const [nome, sinal] of casos) {
  const t0 = performance.now()
  const noso = Melspec.espectrograma(sinal, preparado)
  const msNoso = performance.now() - t0

  const t1 = performance.now()
  const tensor = oficial(sinal)
  const ref = await tensor.data()
  const msRef = performance.now() - t1
  const forma = tensor.shape
  tensor.dispose()

  if (ref.length !== noso.datos.length) {
    console.log(`${nome}: FORMAS DISTINTAS ${JSON.stringify(forma)} vs ${JSON.stringify(noso.forma)}`)
    algunhaMal = true
    continue
  }

  let maxAbs = 0
  let maxRef = 0
  let sumaDif2 = 0
  for (let i = 0; i < ref.length; i++) {
    const d = Math.abs(ref[i] - noso.datos[i])
    if (d > maxAbs) maxAbs = d
    if (Math.abs(ref[i]) > maxRef) maxRef = Math.abs(ref[i])
    sumaDif2 += d * d
  }
  const rms = Math.sqrt(sumaDif2 / ref.length)
  const rel = maxRef ? maxAbs / maxRef : 0
  peorRel = Math.max(peorRel, rel)

  // O criterio non pode ser o erro relativo elemento a elemento: a proxección
  // mel suma valores con signo que se cancelan case por completo nalgúns bins,
  // e aí calquera diferenza de redondeo de float32 dá un erro relativo grande
  // sobre un número minúsculo. As dúas implementacións están á mesma distancia
  // dunha DFT en float64 (`diagnose-melspec.mjs` compróbao), así que o que se
  // esixe é: erro despreciable fronte á ESCALA do espectrograma.
  const ben = rel < 5e-3 && rms / maxRef < 1e-4
  if (!ben) algunhaMal = true

  console.log(`${nome}`)
  console.log(`  forma            ${JSON.stringify(forma)} = ${JSON.stringify(noso.forma)}`)
  console.log(`  máximo de ref.   ${maxRef.toExponential(4)}`)
  console.log(`  erro máx. abs.   ${maxAbs.toExponential(4)}  (${rel.toExponential(3)} do máximo) ${ben ? 'OK' : '✗ DISCREPA'}`)
  console.log(`  erro RMS         ${rms.toExponential(4)}  (${(rms / maxRef).toExponential(3)} do máximo)`)
  console.log(`  tempo noso       ${msNoso.toFixed(1)} ms`)
  console.log(`  tempo oficial    ${msRef.toFixed(1)} ms  (TF.js en CPU, ${(msRef / msNoso).toFixed(1)}× máis lento)\n`)
}

console.log('─'.repeat(60))
if (algunhaMal) {
  console.log(`✗ Hai discrepancias (peor erro relativo ${peorRel.toExponential(3)}).`)
  process.exit(1)
}
console.log(`✓ As dúas implementacións coinciden. Peor erro relativo: ${peorRel.toExponential(3)}`)
