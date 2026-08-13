/* Worker de inferencia de BirdNET.
 *
 * Vive en public/ e cárgase como worker clásico con importScripts, non como
 * módulo do bundle, por unha razón concreta: todo o que está baixo `/birdnet/`
 * queda fóra do precache do service worker (`globIgnores` en nuxt.config.ts).
 * Se TF.js entrase polo bundle, os seus 1,8 MB precachearíanse na instalación e
 * pagaríaos tamén quen nunca use o identificador por son.
 *
 * O worker é deliberadamente parvo: recibe audio e devolve as 6.522 puntuacións
 * do modelo. Quen sabe que especies hai en Galicia e como se chaman é
 * `useBirdnet.ts`, que xa ten o catálogo no bundle.
 *
 * PROCEDENCIA (ver docs/LICENZAS-BIRDNET.md)
 *   Modelo ......... BirdNET GLOBAL 6K v2.4, Kahl et al., CC BY-NC-SA 4.0,
 *                    da conversión oficial a TFJS de birdnet-team/BirdNET-Analyzer
 *                    (código MIT), coas capas do mel-espectrograma retiradas.
 *   Espectrograma .. melspec.js, escrito neste proxecto.
 *   TensorFlow.js .. Apache-2.0.
 * Non hai aquí código de terceiros sen licenza declarada.
 */

/* global tf, Melspec, importScripts */

importScripts('/birdnet/vendor/tf.min.js')
// Cárgase aparte porque o paquete unión de TF.js non trae o backend WebGPU.
// Se non hai WebGPU no navegador nin se intenta.
if ('gpu' in navigator) {
  try { importScripts('/birdnet/vendor/tf-backend-webgpu.min.js') } catch (e) { /* queda WebGL */ }
}
importScripts('/birdnet/melspec.js')

let modelo = null
let melspec = null

/** 3 s a 48 kHz. */
const MOSTRAS = 144000

async function cargar (backendPedido) {
  const traza = { pasos: {} }
  const t0 = performance.now()

  // Contamos os bytes que pasan de verdade pola rede, para poder amosar progreso
  // real e para saber canto ocupa isto no dispositivo.
  let bytesRede = 0
  const fetchOrixinal = self.fetch
  self.fetch = async (...args) => {
    const r = await fetchOrixinal(...args)
    // `Response` só admite estados 200-599: cun 0 (resposta opaca) ou un 204
    // lanzaría un RangeError no medio da carga, e o erro que vería a persoa
    // sería ese e non o de rede que o causou. Nese caso non se conta e
    // devólvese a resposta tal cal, que é o que importa.
    if (r.status < 200 || r.status > 599) return r
    const buf = await r.clone().arrayBuffer()
    bytesRede += buf.byteLength
    postMessage({ tipo: 'bytes', bytes: bytesRede })
    return new Response(buf, { status: r.status, headers: r.headers })
  }

  try {
    const candidatos = backendPedido ? [backendPedido] : ['webgpu', 'webgl']
    let backend = null
    for (const c of candidatos) {
      try {
        if (await tf.setBackend(c)) { await tf.ready(); backend = c; break }
      } catch (e) { /* probamos o seguinte */ }
    }
    // Sen GPU non hai plan B: a rede son 0,8 GFLOPs por fragmento e o backend de
    // CPU de TF.js tarda decenas de segundos. Mellor dicilo que fingir.
    if (!backend) {
      const e = new Error('Este navegador non ten WebGL nin WebGPU.')
      e.codigo = 'sen-gpu'
      throw e
    }
    traza.backend = backend

    try {
      if (backend === 'webgl') {
        const gl = tf.backend().gpgpu.gl
        const dbg = gl.getExtension('WEBGL_debug_renderer_info')
        traza.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      } else {
        traza.gpu = 'WebGPU'
      }
    } catch (e) { traza.gpu = null }

    const t1 = performance.now()
    const params = await (await fetch('/birdnet/melspec.json')).json()
    melspec = Melspec.preparar(params)
    traza.pasos.melspec = performance.now() - t1

    const t2 = performance.now()
    modelo = await tf.loadLayersModel('/birdnet/modelo/model.json', {
      onProgress: (v) => postMessage({ tipo: 'progreso', valor: v }),
    })
    traza.pasos.modelo = performance.now() - t2

    // Primeira inferencia: compila os shaders. É a parte lenta da carga e
    // convén facela agora e non cando o usuario xa premeu «gravar».
    const t3 = performance.now()
    const cero = tf.zeros([1, ...melspec.forma.slice(0)])
    const r = modelo.predict(cero)
    await r.data()
    r.dispose(); cero.dispose()
    traza.pasos.quecemento = performance.now() - t3

    traza.ms = performance.now() - t0
    traza.bytes = bytesRede
    traza.tensores = tf.memory().numBytes
    return traza
  } finally {
    self.fetch = fetchOrixinal
  }
}

/**
 * Audio → puntuacións. O mel-espectrograma calcúlase en JavaScript (CPU) e o
 * modelo só ve xa o espectrograma.
 */
async function predicir (pcm) {
  const nFragmentos = pcm.length / MOSTRAS
  const t0 = performance.now()
  const esp = Melspec.espectrograma(pcm, melspec)
  const msEspectro = performance.now() - t0

  const t1 = performance.now()
  const entrada = tf.tensor(esp.datos, esp.forma)
  const saida = modelo.predict(entrada)
  // O await garante que a GPU rematou de verdade antes de medir.
  const datos = await saida.data()
  entrada.dispose(); saida.dispose()
  const msModelo = performance.now() - t1

  // A última capa (CLASS_ACTIVATION) xa é unha sigmoide: as saídas son
  // confianzas en [0, 1] e non hai que aplicarlles nada máis.
  return {
    puntuacions: datos instanceof Float32Array ? datos : Float32Array.from(datos),
    nFragmentos,
    nClases: datos.length / nFragmentos,
    msEspectro,
    msModelo,
  }
}

// Todas as respostas devolven o `id` da petición que as pediu: é o que lle
// permite a `useBirdnet.ts` casar cada unha coa súa promesa. Os avisos de
// `progreso` e `bytes` non o levan a propósito, porque non pechan nada.
onmessage = async ({ data }) => {
  const id = data.id
  try {
    if (data.tipo === 'cargar') {
      postMessage({ tipo: 'cargado', id, traza: await cargar(data.backend) })

    } else if (data.tipo === 'predicir') {
      const r = await predicir(data.pcm)
      postMessage({ tipo: 'prediccion', id, ...r }, [r.puntuacions.buffer])

    } else if (data.tipo === 'benchmark') {
      const { repeticions = 10, fragmentos = 1 } = data
      const n = fragmentos * MOSTRAS
      const ruido = new Float32Array(n)
      for (let i = 0; i < n; i++) ruido[i] = Math.random() * 2 - 1
      await predicir(ruido) // quecemento, non se contabiliza
      const tempos = []
      for (let r = 0; r < repeticions; r++) {
        const t = performance.now()
        const x = await predicir(ruido)
        tempos.push({ total: performance.now() - t, espectro: x.msEspectro, modelo: x.msModelo })
      }
      postMessage({ tipo: 'benchmark', id, tempos, fragmentos, tensores: tf.memory().numBytes })
    }
  } catch (e) {
    postMessage({ tipo: 'erro', id, codigo: e.codigo || 'erro', mensaxe: e.message })
  }
}
