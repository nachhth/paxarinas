// Mide, sen man humana, o que tarda BirdNET no navegador: carga do modelo e
// inferencia por fragmento de 3 s. Levanta o servidor do spike, abre Chromium
// con GPU real (headed: headless usa SwiftShader por software e a medida non
// valeria de nada) e fala co worker que xa usa a paxina.
//
// Resultado → medicions-tempo.json  e resumo por consola.
//
// IMPORTANTE: isto e ESCRITORIO. Non extrapola a un movil.

import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem, platform, release } from 'node:os'
import { chromium } from 'playwright'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const PORTO = Number(process.env.PORTO || 5199)
const URL_BASE = `http://localhost:${PORTO}`

const CARGAS = Number(process.env.CARGAS || 3)   // cargas en frio (paxina nova)
const REPS = Number(process.env.REPS || 15)      // inferencias por medida

function estat (v) {
  const o = [...v].sort((a, b) => a - b)
  const n = o.length
  const mediana = n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2
  return {
    n,
    min: +o[0].toFixed(1),
    max: +o[n - 1].toFixed(1),
    media: +(o.reduce((s, x) => s + x, 0) / n).toFixed(1),
    mediana: +mediana.toFixed(1),
    p95: +o[Math.min(n - 1, Math.ceil(n * 0.95) - 1)].toFixed(1)
  }
}

// ── Servidor ─────────────────────────────────────────────────────────────────
// Agardamos preguntándolle ao porto, non lendo a súa saída: se o porto xa
// estaba ocupado por outro servidor, mediriamos contra el sen decatarnos.
const servidor = spawn(process.execPath, [join(RAIZ, 'servidor.mjs')], {
  env: { ...process.env, PORTO: String(PORTO) }, stdio: ['ignore', 'inherit', 'inherit']
})
let vivo = false
for (let i = 0; i < 40 && !vivo; i++) {
  if (servidor.exitCode !== null) {
    throw new Error(`o servidor morreu (código ${servidor.exitCode}). Porto ${PORTO} ocupado?`)
  }
  try { vivo = (await fetch(`${URL_BASE}/galegas.json`)).ok } catch { await new Promise(r => setTimeout(r, 250)) }
}
if (!vivo) { servidor.kill(); throw new Error('o servidor non respondeu en 10 s') }
console.log(`servidor en ${URL_BASE}\n`)

// ── Navegador ────────────────────────────────────────────────────────────────
const navegador = await chromium.launch({
  headless: false, // con headless colle SwiftShader (CPU) e a medida sería falsa
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
})
const contexto = await navegador.newContext()
const resultado = {
  xerado: new Date().toISOString(),
  porto: PORTO,
  cargasEnFrio: CARGAS,
  repeticionsPorMedida: REPS,
  navegador: navegador.version(),
  maquina: {
    cpu: cpus()[0]?.model, nucleos: cpus().length,
    memoriaGB: +(totalmem() / 1073741824).toFixed(1), so: `${platform()} ${release()}`
  },
  nota: 'Medido en escritorio con Chromium e GPU real. NON extrapolable a un móbil.'
}

async function abrir () {
  const p = await contexto.newPage()
  p.on('console', (m) => { if (m.type() === 'error') console.log('  [consola]', m.text()) })
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await p.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
  return p
}

// Estas dúas funcións execútanse DENTRO da páxina, non aquí: reutilizan o worker
// e o helper `pedir` que index.html xa define. (De aí que `pedir` non estea
// declarado neste ficheiro.)
/* eslint-disable no-undef */
const GUION_CARGA = async (backend) => {
  const g = await (await fetch('/galegas.json')).json()
  const t0 = performance.now()
  const { traza } = await pedir({ tipo: 'cargar', backend, etiquetas: g.especies })
  traza.msTotalPaxina = performance.now() - t0
  return traza
}

const GUION_BENCH = async ({ fragmentos, repeticions }) => {
  const r = await pedir({ tipo: 'benchmark', fragmentos, repeticions })
  return { tempos: r.tempos, memoria: r.memoriaTF.numBytes }
}
/* eslint-enable no-undef */

// ── Unha tanda completa por backend ──────────────────────────────────────────
resultado.backends = {}
const pedidos = process.env.BACKEND ? [process.env.BACKEND] : ['webgpu', 'webgl']

for (const backendPedido of pedidos) {
  console.log(`\n══ Backend ${backendPedido} ══`)
  const tanda = { cargas: [], inferencia: {} }
  let paxina = null
  try {
    console.log(`Carga do modelo — ${CARGAS} cargas en frío (páxina nova, sen caché HTTP)`)
    for (let i = 0; i < CARGAS; i++) {
      if (paxina) await paxina.close()
      paxina = await abrir()
      const t = await paxina.evaluate(GUION_CARGA, backendPedido)
      tanda.cargas.push(t)
      console.log(`  ${i + 1}/${CARGAS}  backend=${t.backend} (${t.renderer})  ` +
        `rede ${(t.bytesRede / 1048576).toFixed(1)} MB  ` +
        `modelo ${t.msModelo.toFixed(0)} ms  área ${t.msArea.toFixed(0)} ms  ` +
        `1ª inferencia ${t.msQuecemento.toFixed(0)} ms  total ${t.msTotalPaxina.toFixed(0)} ms`)
    }
    tanda.backend = tanda.cargas[0].backend
    tanda.renderer = tanda.cargas[0].renderer
    tanda.bytesRede = tanda.cargas[0].bytesRede
    tanda.estatCarga = {
      msModelo: estat(tanda.cargas.map(c => c.msModelo)),
      msArea: estat(tanda.cargas.map(c => c.msArea)),
      msQuecemento: estat(tanda.cargas.map(c => c.msQuecemento)),
      msTotal: estat(tanda.cargas.map(c => c.msTotalPaxina))
    }
    console.log(`  → mediana total ata listo: ${tanda.estatCarga.msTotal.mediana} ms\n`)

    for (const fragmentos of [1, 5, 10]) {
      const r = await paxina.evaluate(GUION_BENCH, { fragmentos, repeticions: REPS })
      const e = estat(r.tempos)
      const porFragmento = +(e.mediana / fragmentos).toFixed(1)
      const audioMs = fragmentos * 3000
      tanda.inferencia[fragmentos] = {
        ...e, tempos: r.tempos.map(t => +t.toFixed(1)), porFragmento,
        factorTempoReal: +(audioMs / e.mediana).toFixed(1), memoriaTF: r.memoria
      }
      console.log(`Inferencia ${String(fragmentos).padStart(2)} fragmento(s) (${fragmentos * 3} s de audio), ${REPS} repeticións:` +
        `  mediana ${String(e.mediana).padStart(7)} ms` +
        `   por fragmento ${String(porFragmento).padStart(6)} ms` +
        `   ${(audioMs / e.mediana).toFixed(0)}× tempo real`)
    }
  } catch (e) {
    tanda.erro = e.message.split('\n')[0]
    console.log(`  ${backendPedido}: NON medible — ${tanda.erro}`)
  }
  if (paxina) await paxina.close()
  resultado.backends[backendPedido] = tanda
}

// ── Referencia en CPU: esperamos que falle, e iso é un dato ──────────────────
// Sen WebGL nin WebGPU non hai kernel STFT, así que non hai plan B por software.
if (!process.env.SEN_CPU) {
  console.log('\nBackend CPU (peor caso: dispositivo sen WebGL nin WebGPU)…')
  const pCpu = await abrir()
  try {
    await pCpu.evaluate(GUION_CARGA, 'cpu')
    const r = await pCpu.evaluate(GUION_BENCH, { fragmentos: 1, repeticions: 5 })
    const e = estat(r.tempos)
    resultado.cpu = { ...e, tempos: r.tempos.map(t => +t.toFixed(1)) }
    console.log(`  CPU, 1 fragmento: mediana ${e.mediana} ms  (${(3000 / e.mediana).toFixed(1)}× tempo real)`)
  } catch (e) {
    resultado.cpu = { erro: e.message.split('\n')[0] }
    console.log('  imposible: ' + resultado.cpu.erro)
  }
  await pCpu.close()
}

await navegador.close()
servidor.kill()

await writeFile(join(RAIZ, 'medicions-tempo.json'), JSON.stringify(resultado, null, 2))
console.log('\n→ medicions-tempo.json')
