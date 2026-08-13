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

for (const [url, nome] of FICHEIROS) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`)
  const datos = Buffer.from(await r.arrayBuffer())
  await writeFile(join(DESTINO, nome), datos)
  const sha = createHash('sha256').update(datos).digest('hex').slice(0, 16)
  console.log(`${nome.padEnd(32)} ${String(datos.length).padStart(8)} B  sha256:${sha}`)
}

console.log(`\nTensorFlow.js ${VERSION} → ${DESTINO}`)
