// Diagnóstico: de onde vén a diferenza entre o noso mel-espectrograma e o de
// TensorFlow.js. Compara a RFFT crúa e mira se o erro é de estrutura ou de
// precisión de float32.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tf from '@tensorflow/tfjs'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const BIRDNET = join(RAIZ, '..', '..', 'public', 'birdnet')
await tf.setBackend('cpu'); await tf.ready()

const fonte = await readFile(join(BIRDNET, 'melspec.js'), 'utf8')
const ambito = {}; new Function('self', 'module', fonte)(ambito, {})
const M = ambito.Melspec

let s = 7
const N = 2048
const x = new Float32Array(N)
for (let i = 0; i < N; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; x[i] = (s / 0x7fffffff) * 2 - 1 }

// A nosa RFFT (con Hann dentro)
const t = M.taboas(N)
const noso = new Float32Array(N / 2 + 1)
M.rfftReal(x, 0, t, noso, N / 2)

// A de TF.js sobre o mesmo sinal xa enfiestrado
const fiestrado = tf.mul(tf.tensor1d(x), tf.signal.hannWindow(N))
const ref = await tf.real(tf.spectral.rfft(fiestrado)).data()

// E unha DFT en float64 como verdade de referencia
const hann = new Float64Array(N)
for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
const verdade = new Float64Array(N / 2 + 1)
for (let k = 0; k <= N / 2; k++) {
  let acc = 0
  for (let n = 0; n < N; n++) acc += x[n] * hann[n] * Math.cos((-2 * Math.PI * k * n) / N)
  verdade[k] = acc
}

const err = (a) => {
  let m = 0; let esc = 0
  for (let k = 0; k <= N / 2; k++) { esc = Math.max(esc, Math.abs(verdade[k])); m = Math.max(m, Math.abs(a[k] - verdade[k])) }
  return { abs: m, rel: m / esc }
}
console.log('RFFT contra unha DFT en float64:')
const a = err(noso); const b = err(ref)
console.log(`  a nosa    erro máx ${a.abs.toExponential(3)}  relativo ${a.rel.toExponential(3)}`)
console.log(`  TF.js     erro máx ${b.abs.toExponential(3)}  relativo ${b.rel.toExponential(3)}`)
console.log(`  → ${a.rel < b.rel ? 'a nosa está MÁIS preto da verdade' : 'TF.js está máis preto'}`)
console.log('\nSe as dúas están á mesma distancia da verdade en float64, a diferenza')
console.log('entre elas é ruído de redondeo de float32, non un erro de estrutura.')

// Onde se concentra o erro do espectrograma completo: nos valores grandes ou nos pequenos?
const params = JSON.parse(await readFile(join(BIRDNET, 'melspec.json'), 'utf8'))
const prep = M.preparar(params)
const sinal = new Float32Array(params.mostras)
s = 3
for (let i = 0; i < sinal.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; sinal[i] = (s / 0x7fffffff) * 2 - 1 }
const nosoEsp = M.espectrograma(sinal, prep)

function bancoDenso (f) {
  const m = Array.from({ length: f.nBins }, () => new Array(f.nBandas).fill(0))
  f.bandas.forEach((banda, bi) => banda.pesos.forEach((p, k) => { m[banda.inicio + k][bi] = p }))
  return tf.tensor2d(m)
}
const bancos = params.canles.map(c => bancoDenso(c.filtro))
const refEsp = await tf.tidy(() => tf.concat(params.canles.map((c, i) => {
  let e = tf.tensor1d(sinal)
  e = tf.sub(e, tf.min(e, -1, true)); e = tf.div(e, tf.max(e, -1, true).add(1e-6))
  e = tf.mul(tf.sub(e, 0.5), 2.0)
  let sp = tf.cast(tf.signal.stft(e, c.frameLength, c.frameStep, c.frameLength, tf.signal.hannWindow), 'float32')
  sp = tf.matMul(sp, bancos[i]).pow(2.0).pow(tf.scalar(1 / (1 + Math.exp(c.magScale))))
  return tf.transpose(tf.reverse(sp, -1)).expandDims(-1)
}), -1).expandDims(0)).data()

let maxRef = 0
for (const v of refEsp) maxRef = Math.max(maxRef, v)
const cortes = [0.5, 0.1, 0.01, 0.001]
console.log(`\nErro relativo do espectrograma por tramo de magnitude (máx ${maxRef.toFixed(3)}):`)
for (const c of cortes) {
  let n = 0; let peor = 0
  for (let i = 0; i < refEsp.length; i++) {
    if (refEsp[i] >= c * maxRef) { n++; peor = Math.max(peor, Math.abs(refEsp[i] - nosoEsp.datos[i]) / refEsp[i]) }
  }
  console.log(`  valores ≥ ${(c * 100).toFixed(1)}% do máximo: ${String(n).padStart(6)} elementos, peor erro relativo ${peor.toExponential(3)}`)
}
let n = 0; let peor = 0
for (let i = 0; i < refEsp.length; i++) {
  if (refEsp[i] < 0.001 * maxRef) { n++; peor = Math.max(peor, Math.abs(refEsp[i] - nosoEsp.datos[i]) / (refEsp[i] || 1e-30)) }
}
console.log(`  valores < 0.1% do máximo:  ${String(n).padStart(6)} elementos, peor erro relativo ${peor.toExponential(3)}`)
