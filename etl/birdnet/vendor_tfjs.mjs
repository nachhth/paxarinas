// Baixa TensorFlow.js a public/birdnet/vendor/, que é o que carga o worker con
// importScripts.
//
// Por que non vai polo bundle de Nuxt: TF.js son ~1,8 MB de JavaScript e o
// precache do service worker precachea todo o .js que xera o build. O
// identificador por son é unha función opcional que a maioría da xente non vai
// usar; meter TF.js no precache faríallelo pagar a todo o mundo. Aquí queda
// fóra, baixo `/birdnet/`, que está en `globIgnores`.
//
// TensorFlow.js é Apache-2.0. Gárdase a licenza ao lado dos ficheiros.
//
// Uso:  node etl/birdnet/vendor_tfjs.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const DESTINO = join(RAIZ, '..', '..', 'public', 'birdnet', 'vendor')

// Fixada: unha actualización silenciosa de TF.js podería cambiar as predicións.
export const VERSION = '4.22.0'

const FICHEIROS = [
  [`https://unpkg.com/@tensorflow/tfjs@${VERSION}/dist/tf.min.js`, 'tf.min.js'],
  // O paquete unión @tensorflow/tfjs NON trae o backend WebGPU. Sen este
  // ficheiro `tf.setBackend('webgpu')` devolve false sempre e todo cae en WebGL
  // sen dicir por que.
  [`https://unpkg.com/@tensorflow/tfjs-backend-webgpu@${VERSION}/dist/tf-backend-webgpu.min.js`,
    'tf-backend-webgpu.min.js'],
  ['https://raw.githubusercontent.com/tensorflow/tfjs/master/LICENSE', 'LICENSE-tensorflowjs.txt'],
]

await mkdir(DESTINO, { recursive: true })

/**
 * Quítalle a `tf.min.js` os dous sitios onde avalía cadeas como JavaScript.
 *
 * A CSP do sitio non permite `eval`, e o resultado era un `EvalError` ao cargar
 * o worker que deixaba `/escoitar` morto sen máis pista que unha mensaxe de
 * CSP. A alternativa —abrir `'unsafe-eval'` na cabeceira— daríalle permiso a
 * 1,4 MB de código de terceiros para sempre, por dúas liñas que nin sequera
 * fan falta aquí:
 *
 *   · `Function("return this")()`: último recurso do envoltorio UMD para atopar
 *     o obxecto global. É a última rama dun `||` no que `globalThis` xa entra
 *     de primeiro, e nun worker `globalThis` existe.
 *   · `Function("r","regeneratorRuntime = r")(t)`: está no `catch` de
 *     `try{regeneratorRuntime=t}`. A asignación falla —non hai tal variable— e
 *     entón execútase isto, que é o que rompía de verdade. Asignar sobre
 *     `globalThis` fai o mesmo sen avaliar nada.
 *
 * Faise aquí e non a man para que non volva ao revendorizar. Se TF.js cambia
 * estas liñas, o `throw` avisa en vez de deixalo pasar en silencio.
 *
 * Queda un terceiro `Function('return require(...)')` que NON se toca: vai
 * dentro dun `try/catch` propio, así que a CSP bloquéao e o código segue. Deixa
 * un aviso na consola e nada máis.
 */
const PARCHES = [
  ['Function("return this")()', 'globalThis'],
  ['Function("r","regeneratorRuntime = r")(t)', 'globalThis.regeneratorRuntime=t'],
]

function sen_eval(nome, datos) {
  if (nome !== 'tf.min.js') return datos
  let texto = datos.toString('utf8')
  for (const [vello, novo] of PARCHES) {
    const n = texto.split(vello).length - 1
    if (n !== 1) {
      throw new Error(
        `tf.min.js: agardábase 1 aparición de «${vello}» e hai ${n}. `
        + 'Revisa se TF.js segue precisando o parche antes de tocar a CSP.')
    }
    texto = texto.replace(vello, novo)
  }
  return Buffer.from(texto, 'utf8')
}

for (const [url, nome] of FICHEIROS) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`)
  const datos = sen_eval(nome, Buffer.from(await r.arrayBuffer()))
  await writeFile(join(DESTINO, nome), datos)
  const sha = createHash('sha256').update(datos).digest('hex').slice(0, 16)
  console.log(`${nome.padEnd(32)} ${String(datos.length).padStart(8)} B  sha256:${sha}`)
}

console.log(`\nTensorFlow.js ${VERSION} → ${DESTINO}`)
