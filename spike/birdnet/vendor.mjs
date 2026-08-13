// Copia TensorFlow.js de node_modules a public/vendor/, que e o que carga o
// worker con importScripts. public/vendor/ esta gitignorado.
//
// Ollo: o paquete union @tensorflow/tfjs NON inclue o backend WebGPU. Hai que
// copiar tamen @tensorflow/tfjs-backend-webgpu; sen el tf.setBackend('webgpu')
// devolve false sempre e todo cae en WebGL sen dicir por que.

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const DESTINO = join(RAIZ, 'public', 'vendor')
await mkdir(DESTINO, { recursive: true })

const FICHEIROS = [
  ['@tensorflow/tfjs/dist/tf.min.js', 'tf.min.js'],
  ['@tensorflow/tfjs-backend-webgpu/dist/tf-backend-webgpu.min.js', 'tf-backend-webgpu.min.js']
]

for (const [orixe, nome] of FICHEIROS) {
  const de = join(RAIZ, 'node_modules', ...orixe.split('/'))
  const a = join(DESTINO, nome)
  await copyFile(de, a)
  const { size } = await stat(a)
  console.log(`${nome.padEnd(30)} ${(size / 1024).toFixed(0)} kB`)
}
