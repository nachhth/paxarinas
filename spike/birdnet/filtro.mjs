// Demostra, con numeros, canto reduce cada estratexia de filtrado o espazo de
// busca: das 6.522 saidas de BirdNET as ~380 aves de Galicia.
//
//   A · lista de etiquetas do catalogo galego  (filtrado posterior das saidas)
//   B · meta-modelo de area de BirdNET         (lat, lon, semana → probabilidade)
//   C · fenoloxia mensual de data/especies.json
//   A+C e A+B, que e o que se usaria de verdade
//
// O meta-modelo (B) executase de verdade no navegador, non se estima.
// Resultado → medicions-filtro.json

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const PORTO = Number(process.env.PORTO || 5199)

// Centro aproximado de Galicia. BirdNET traballa con lat/lon e semana (1-48).
const LAT = 42.75
const LON = -8.0
const LIMIAR_AREA = 0.03 // o que usa BirdNET-Analyzer por defecto

const galegas = JSON.parse(await readFile(join(RAIZ, 'public', 'galegas.json'), 'utf8'))
const N_MODELO = galegas.etiquetasBirdNET

// ── B · meta-modelo de área, executado de verdade ────────────────────────────
const servidor = spawn(process.execPath, [join(RAIZ, 'servidor.mjs')], {
  env: { ...process.env, PORTO: String(PORTO) }, stdio: ['ignore', 'inherit', 'inherit']
})
let vivo = false
for (let i = 0; i < 40 && !vivo; i++) {
  if (servidor.exitCode !== null) throw new Error(`o servidor morreu. Porto ${PORTO} ocupado?`)
  try { vivo = (await fetch(`http://localhost:${PORTO}/galegas.json`)).ok } catch { await new Promise(r => setTimeout(r, 250)) }
}
if (!vivo) { servidor.kill(); throw new Error('o servidor non respondeu en 10 s') }

const navegador = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] })
const paxina = await navegador.newPage()
await paxina.goto(`http://localhost:${PORTO}`, { waitUntil: 'domcontentloaded' })

/* eslint-disable no-undef */
const saidasArea = await paxina.evaluate(async ({ lat, lon }) => {
  const g = await (await fetch('/galegas.json')).json()
  await pedir({ tipo: 'cargar', backend: null, etiquetas: g.especies })
  const porSemana = {}
  // BirdNET divide o ano en 48 semanas (4 por mes). Pedimos a semana central
  // de cada mes: 3, 7, 11… así hai un valor por mes comparable coa fenoloxía.
  for (let mes = 0; mes < 12; mes++) {
    const semana = mes * 4 + 3
    const r = await pedir({ tipo: 'area', lat, lon, semana })
    porSemana[mes] = r.saida
  }
  return porSemana
}, { lat: LAT, lon: LON })
/* eslint-enable no-undef */

await navegador.close()
servidor.kill()

// ── Contas ───────────────────────────────────────────────────────────────────
const MESES = ['xan', 'feb', 'mar', 'abr', 'mai', 'xuñ', 'xul', 'ago', 'set', 'out', 'nov', 'dec']
const indicesGalegos = new Set(galegas.especies.map(e => e.i))

const porMes = []
for (let m = 0; m < 12; m++) {
  const area = saidasArea[m]
  const sobreLimiar = area.filter(v => v >= LIMIAR_AREA).length
  const areaEIndice = [...indicesGalegos].filter(i => area[i] >= LIMIAR_AREA).length

  // C · fenoloxía: descarta as que non teñen ningunha cita nese mes.
  // As que non teñen fenoloxía fiable (meses === null) NON se descartan.
  const listaMes = galegas.especies.filter(e => !e.meses || e.meses[m] > 0)

  // A+C, que é o filtro que faría a app
  const listaMesArea = listaMes.filter(e => area[e.i] >= LIMIAR_AREA)

  // Variante «só habituais»: sen as raras/divagantes do catálogo
  const habituaisMes = listaMes.filter(e => !e.rara)

  porMes.push({
    mes: MESES[m],
    soArea: sobreLimiar,
    soGalegas: galegas.cubertas,
    galegasMes: listaMes.length,
    habituaisMes: habituaisMes.length,
    galegasMasArea: areaEIndice,
    galegasMesMasArea: listaMesArea.length
  })
}

const media = (f) => +(porMes.reduce((s, x) => s + f(x), 0) / 12).toFixed(1)

const resultado = {
  xerado: new Date().toISOString(),
  lat: LAT, lon: LON, limiarArea: LIMIAR_AREA,
  clasesDoModelo: N_MODELO,
  catalogoGalego: galegas.catalogo,
  cubertasPoloModelo: galegas.cubertas,
  senCorrespondencia: galegas.senCorrespondencia,
  conFenoloxiaFiable: galegas.especies.filter(e => e.meses).length,
  porMes,
  habituaisCubertas: galegas.especies.filter(e => !e.rara).length,
  medias: {
    soArea: media(x => x.soArea),
    galegasMes: media(x => x.galegasMes),
    habituaisMes: media(x => x.habituaisMes),
    galegasMasArea: media(x => x.galegasMasArea),
    galegasMesMasArea: media(x => x.galegasMesMasArea)
  }
}

await writeFile(join(RAIZ, 'medicions-filtro.json'), JSON.stringify(resultado, null, 2))

// ── Informe ──────────────────────────────────────────────────────────────────
const pct = (n) => `${(100 * n / N_MODELO).toFixed(1)}%`
console.log(`\nEspazo de busca de BirdNET ............... ${N_MODELO} clases`)
console.log(`A · só as do catálogo galego ............. ${galegas.cubertas}  (${pct(galegas.cubertas)})`)
console.log(`    delas, só as habituais ............... ${resultado.habituaisCubertas}  (${pct(resultado.habituaisCubertas)})`)
console.log(`B · só o meta-modelo de área (media/mes) . ${resultado.medias.soArea}  (${pct(resultado.medias.soArea)})`)
console.log(`A+C · galegas do mes (media) ............. ${resultado.medias.galegasMes}  (${pct(resultado.medias.galegasMes)})`)
console.log(`    habituais do mes (media) ............. ${resultado.medias.habituaisMes}  (${pct(resultado.medias.habituaisMes)})`)
console.log(`A+B · galegas ∩ área (media) ............. ${resultado.medias.galegasMasArea}  (${pct(resultado.medias.galegasMasArea)})`)
console.log(`A+B+C · todo xunto (media) ............... ${resultado.medias.galegasMesMasArea}  (${pct(resultado.medias.galegasMesMasArea)})\n`)

console.log('mes   só área   galegas   galegas+mes   habituais+mes   galegas+área   as tres')
for (const m of porMes) {
  console.log(
    `${m.mes}  ${String(m.soArea).padStart(7)}   ${String(m.soGalegas).padStart(7)}   ` +
    `${String(m.galegasMes).padStart(11)}   ${String(m.habituaisMes).padStart(13)}   ` +
    `${String(m.galegasMasArea).padStart(12)}   ${String(m.galegasMesMasArea).padStart(7)}`
  )
}
console.log('\n→ medicions-filtro.json')
