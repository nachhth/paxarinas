/* Worker de inferencia BirdNET con TensorFlow.js.
 *
 * A capa MelSpecLayerSimple e os kernels STFT para WebGL/WebGPU están tomados de
 * georg95/birdnet-web (https://github.com/georg95/birdnet-web), que é o código
 * do que parte a demo oficial de Cornell (https://birdnet.cornell.edu/demo/).
 * Ese repositorio NON declara licenza: para un uso que non sexa un spike hai que
 * pedirlla ao autor ou reimplementar a capa.
 *
 * O modelo é BirdNET (Kahl et al.), CC BY-NC-SA 4.0. Código MIT.
 *
 * A razón de ser deste ficheiro: o mel-espectrograma de BirdNET usa unha RFFT que
 * TensorFlow.js non expón como kernel utilizable dentro dunha capa Keras
 * convertida, e que ONNX directamente non soporta. Aquí a RFFT implícita
 * resólvese cun kernel propio (Cooley-Tukey) escrito en GLSL e en WGSL.
 */

importScripts('/vendor/tf.min.js')
// O paquete unión @tensorflow/tfjs NON trae o backend WebGPU: hai que cargalo
// aparte. Sen isto, tf.setBackend('webgpu') devolve false sempre e todo cae en
// WebGL sen dicir por que.
if ('gpu' in navigator) {
  try { importScripts('/vendor/tf-backend-webgpu.min.js') } catch (e) { /* seguimos con WebGL */ }
}

let modelo = null
let modeloArea = null
let etiquetas = null

const MOSTRAS = 144000 // 3 s a 48 kHz: a fiestra que espera BirdNET

// ─────────────────────────────────────────────────────────────────────────────
// Capa do mel-espectrograma
// ─────────────────────────────────────────────────────────────────────────────
class MelSpecLayerSimple extends tf.layers.Layer {
  constructor (config) {
    super(config)
    this.sampleRate = config.sampleRate
    this.specShape = config.specShape
    this.frameStep = config.frameStep
    this.frameLength = config.frameLength
    this.melFilterbank = tf.tensor2d(config.melFilterbank)
  }

  build (inputShape) {
    this.magScale = this.addWeight(
      'magnitude_scaling', [], 'float32', tf.initializers.constant({ value: 1.23 })
    )
    super.build(inputShape)
  }

  computeOutputShape (inputShape) {
    return [inputShape[0], this.specShape[0], this.specShape[1], 1]
  }

  call (inputs) {
    return tf.tidy(() => {
      inputs = inputs[0]
      return tf.stack(inputs.split(inputs.shape[0]).map((input) => {
        let spec = input.squeeze()
        spec = tf.sub(spec, tf.min(spec, -1, true))
        spec = tf.div(spec, tf.max(spec, -1, true).add(0.000001))
        spec = tf.sub(spec, 0.5)
        spec = tf.mul(spec, 2.0)
        spec = tf.engine().runKernel('STFT', {
          signal: spec, frameLength: this.frameLength, frameStep: this.frameStep
        })
        spec = tf.matMul(spec, this.melFilterbank)
        spec = spec.pow(2.0)
        spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))))
        spec = tf.reverse(spec, -1)
        spec = tf.transpose(spec)
        return spec.expandDims(-1)
      }))
    })
  }

  static get className () { return 'MelSpecLayerSimple' }
}
tf.serialization.registerClass(MelSpecLayerSimple)

// ─────────────────────────────────────────────────────────────────────────────
// Kernel STFT (o que fai viable todo isto)
// ─────────────────────────────────────────────────────────────────────────────
tf.registerKernel({
  kernelName: 'STFT',
  backendName: 'webgl',
  kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
    const innerDim = frameLength / 2
    const batch = (signal.size - frameLength + frameStep) / frameStep | 0
    let actual = backend.runWebGLProgram({
      variableNames: ['x'],
      outputShape: [batch, frameLength],
      userCode: `
      void main() {
        ivec2 coords = getOutputCoords();
        int p = coords[1] % ${innerDim};
        int k = 0;
        for (int i = 0; i < ${Math.log2(innerDim)}; ++i) {
          if ((p & (1 << i)) != 0) { k |= (1 << (${Math.log2(innerDim) - 1} - i)); }
        }
        int i = 2 * k;
        if (coords[1] >= ${innerDim}) { i = 2 * (k % ${innerDim}) + 1; }
        int q = coords[0] * ${frameLength} + i;
        float val = getX((q / ${frameLength}) * ${frameStep} + q % ${frameLength});
        float cosArg = ${2.0 * Math.PI / frameLength} * float(q);
        float mul = 0.5 - 0.5 * cos(cosArg);
        setOutput(val * mul);
      }`
    }, [signal], 'float32')
    for (let len = 1; len < innerDim; len *= 2) {
      const previo = actual
      actual = backend.runWebGLProgram({
        variableNames: ['x'],
        outputShape: [batch, innerDim * 2],
        userCode: `void main() {
          ivec2 coords = getOutputCoords();
          int batch = coords[0];
          int i = coords[1];
          int k = i % ${innerDim};
          int isHigh = (k % ${len * 2}) / ${len};
          int highSign = (1 - isHigh * 2);
          int baseIndex = k - isHigh * ${len};
          float t = ${Math.PI / len} * float(k % ${len});
          float a = cos(t);
          float b = sin(-t);
          float oddK_re = getX(batch, baseIndex + ${len});
          float oddK_im = getX(batch, baseIndex + ${len + innerDim});
          if (i < ${innerDim}) {
            float evenK_re = getX(batch, baseIndex);
            setOutput(evenK_re + (oddK_re * a - oddK_im * b) * float(highSign));
          } else {
            float evenK_im = getX(batch, baseIndex + ${innerDim});
            setOutput(evenK_im + (oddK_re * b + oddK_im * a) * float(highSign));
          }
        }`
      }, [actual], 'float32')
      backend.disposeIntermediateTensorInfo(previo)
    }
    const real = backend.runWebGLProgram({
      variableNames: ['x'],
      outputShape: [batch, innerDim + 1],
      userCode: `void main() {
        ivec2 coords = getOutputCoords();
        int batch = coords[0];
        int i = coords[1];
        int zI = i % ${innerDim};
        int conjI = (${innerDim} - i) % ${innerDim};
        float Zk0 = getX(batch, zI);
        float Zk1 = getX(batch, zI+${innerDim});
        float Zk_conj0 = getX(batch, conjI);
        float Zk_conj1 = -getX(batch, conjI+${innerDim});
        float t = ${-2 * Math.PI} * float(i) / float(${innerDim * 2});
        float diff0 = Zk0 - Zk_conj0;
        float diff1 = Zk1 - Zk_conj1;
        setOutput((Zk0 + Zk_conj0 + cos(t) * diff1 + sin(t) * diff0) * 0.5);
      }`
    }, [actual], 'float32')
    backend.disposeIntermediateTensorInfo(actual)
    return real
  }
})

tf.registerKernel({
  kernelName: 'STFT',
  backendName: 'webgpu',
  kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
    const workgroupSize = [64, 1, 1]
    const innerDim = frameLength / 2
    const batch = (signal.size - frameLength + frameStep) / frameStep | 0
    let actual = backend.runWebGPUProgram({
      variableNames: ['x'],
      workgroupSize,
      outputShape: [batch, innerDim * 2],
      shaderKey: `fft_permut_${innerDim}_${frameStep}`,
      dispatchLayout: { x: [0, 1] },
      dispatch: [Math.ceil(batch * innerDim * 2 / workgroupSize[0]), 1, 1],
      getUserCode: () => `
      fn main(index: i32) {
        let batch = index / ${innerDim * 2};
        let p = index % ${innerDim};
        var k = 0;
        for (var i: u32 = 0; i < ${Math.log2(innerDim)}; i = i + 1) {
          if ((p & (1 << i)) != 0) { k |= (1 << (${Math.log2(innerDim) - 1} - i)); }
        }
        var i = 2 * k;
        if (index % ${innerDim * 2} >= ${innerDim}) { i = 2 * (k % ${innerDim}) + 1; }
        var q = batch * ${frameLength} + i;
        var val = getX((q / ${frameLength}) * ${frameStep} + q % ${frameLength});
        var cosArg = ${2.0 * Math.PI / frameLength} * f32(q);
        var mul = 0.5 - 0.5 * cos(cosArg);
        setOutputAtIndex(index, val * mul);
      }`
    }, [signal], 'float32')
    for (let len = 1; len < innerDim; len *= 2) {
      const previo = actual
      actual = backend.runWebGPUProgram({
        variableNames: ['x'],
        workgroupSize,
        outputShape: [batch, innerDim * 2],
        shaderKey: `fft_step_${innerDim}_${len}`,
        dispatchLayout: { x: [0, 1] },
        dispatch: [Math.ceil(batch * innerDim / workgroupSize[0]), 1, 1],
        getUserCode: () => `fn main(index: i32) {
          let batch = index / ${innerDim};
          var i = index % ${innerDim};
          let outIndexReal = batch * ${innerDim * 2} + i;
          let outIndexImag = outIndexReal + ${innerDim};
          let isHigh = (i % (${len} * 2)) / ${len};
          let highSign = (1 - isHigh * 2);
          let baseIndex = i - isHigh * ${len};
          let t = ${Math.PI / len} * f32(i % ${len});
          let a = cos(t);
          let b = sin(-t);
          let oddK_re = getX(batch, baseIndex + ${len});
          let oddK_im = getX(batch, baseIndex + ${len} + ${innerDim});
          let evenK_re = getX(batch, baseIndex);
          setOutputAtIndex(outIndexReal, (evenK_re + (oddK_re * a - oddK_im * b) * f32(highSign)));
          let evenK_im = getX(batch, baseIndex + ${innerDim});
          setOutputAtIndex(outIndexImag, (evenK_im + (oddK_re * b + oddK_im * a) * f32(highSign)));
        }`
      }, [actual], 'float32')
      backend.disposeData(previo.dataId)
    }
    const real = backend.runWebGPUProgram({
      variableNames: ['x'],
      workgroupSize,
      outputShape: [batch, innerDim + 1],
      shaderKey: `rfft_reassemble_${innerDim}_real`,
      dispatchLayout: { x: [0, 1] },
      dispatch: [Math.ceil((batch * (innerDim + 1)) / workgroupSize[0]), 1, 1],
      getUserCode: () => `fn main(index: i32) {
        let batch = index / ${innerDim + 1};
        let i = index % ${innerDim + 1};
        let zI = i % ${innerDim};
        let conjI = (${innerDim} - i) % ${innerDim};
        let Zk0 = getX(batch, zI);
        let Zk1 = getX(batch, zI+${innerDim});
        let Zk_conj0 = getX(batch, conjI);
        let Zk_conj1 = -getX(batch, conjI+${innerDim});
        let t = ${-2 * Math.PI} * f32(i) / f32(${innerDim * 2});
        let diff0 = Zk0 - Zk_conj0;
        let diff1 = Zk1 - Zk_conj1;
        setOutputAtIndex(index, (Zk0 + Zk_conj0 + cos(t) * diff1 + sin(t) * diff0) * 0.5);
      }`
    }, [actual], 'float32')
    backend.disposeData(actual.dataId)
    return real
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Carga e inferencia
// ─────────────────────────────────────────────────────────────────────────────
async function cargar (backendPedido) {
  const traza = {}
  const t0 = performance.now()

  // Contabilizamos os bytes que realmente pasan pola rede interceptando fetch.
  let bytesRede = 0
  const fetchOrixinal = self.fetch
  self.fetch = async (...args) => {
    const r = await fetchOrixinal(...args)
    const clon = r.clone()
    const buf = await clon.arrayBuffer()
    bytesRede += buf.byteLength
    return new Response(buf, { status: r.status, headers: r.headers })
  }

  const candidatos = backendPedido ? [backendPedido] : ['webgpu', 'webgl']
  let backend = null
  for (const c of candidatos) {
    try {
      if (await tf.setBackend(c)) { await tf.ready(); backend = c; break }
    } catch (e) { /* probamos o seguinte */ }
  }
  if (!backend) throw new Error('Nin WebGPU nin WebGL dispoñibles. BirdNET non pode correr aquí.')
  traza.backend = backend
  traza.msBackend = performance.now() - t0

  // Datos do adaptador/GPU, para saber se a medida é real ou de software
  try {
    if (backend === 'webgl') {
      const gl = tf.backend().gpgpu.gl
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      traza.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      traza.webglVersion = tf.env().getNumber('WEBGL_VERSION')
      traza.float32Render = tf.env().getBool('WEBGL_RENDER_FLOAT32_ENABLED')
      traza.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    } else {
      traza.renderer = 'WebGPU'
    }
  } catch (e) { traza.renderer = 'descoñecido: ' + e.message }

  const t1 = performance.now()
  modelo = await tf.loadLayersModel('/modelo/model.json', {
    onProgress: (p) => postMessage({ tipo: 'progreso', valor: p })
  })
  traza.msModelo = performance.now() - t1

  const t2 = performance.now()
  modeloArea = await tf.loadGraphModel('/modelo/area-model/model.json')
  traza.msArea = performance.now() - t2

  const t3 = performance.now()
  const r = modelo.predict(tf.zeros([1, MOSTRAS]))
  await r.data()
  r.dispose()
  traza.msQuecemento = performance.now() - t3

  traza.msTotal = performance.now() - t0
  traza.bytesRede = bytesRede
  traza.memoriaTF = tf.memory()
  self.fetch = fetchOrixinal
  return traza
}

async function inferir (pcm, fragmentos) {
  const entrada = tf.tensor(pcm, [fragmentos, MOSTRAS])
  const saida = modelo.predict(entrada)
  const datos = await saida.data() // await = a GPU rematou de verdade
  entrada.dispose(); saida.dispose()
  return datos
}

// A última capa do modelo (CLASS_ACTIVATION) xa é unha sigmoide: as saídas son
// confianzas en [0,1] e NON hai que volver aplicarlles nada.

// ─────────────────────────────────────────────────────────────────────────────
onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'cargar') {
      const traza = await cargar(data.backend)
      etiquetas = data.etiquetas
      postMessage({ tipo: 'cargado', traza })

    } else if (data.tipo === 'benchmark') {
      const { repeticions = 10, fragmentos = 1 } = data
      const n = fragmentos * MOSTRAS
      const ruido = new Float32Array(n)
      for (let i = 0; i < n; i++) ruido[i] = Math.random() * 2 - 1
      // Unha pasada de quecemento que non se contabiliza (compilación de shaders)
      await inferir(ruido, fragmentos)
      const tempos = []
      for (let r = 0; r < repeticions; r++) {
        const t = performance.now()
        await inferir(ruido, fragmentos)
        tempos.push(performance.now() - t)
      }
      postMessage({ tipo: 'benchmark', tempos, fragmentos, memoriaTF: tf.memory() })

    } else if (data.tipo === 'area') {
      // Só o meta-modelo de área: (lat, lon, semana) → probabilidade por especie.
      // Serve para medir canto acota por si só, sen tocar o audio.
      const t = tf.tensor([[data.lat, data.lon, data.semana]])
      const saida = await modeloArea.predict(t).data()
      t.dispose()
      postMessage({ tipo: 'area', saida: Array.from(saida) })

    } else if (data.tipo === 'predicir') {
      const fragmentos = data.pcm.length / MOSTRAS
      const t = performance.now()
      const bruto = await inferir(data.pcm, fragmentos)
      const ms = performance.now() - t
      const nClases = bruto.length / fragmentos

      // Filtro xeográfico e temporal opcional co meta-modelo de área
      let xeo = null
      if (data.area) {
        const t2 = tf.tensor([[data.area.lat, data.area.lon, data.area.semana]])
        xeo = await modeloArea.predict(t2).data()
        t2.dispose()
      }

      // Só nos quedamos coas saídas que corresponden a especies galegas
      const resultados = []
      for (const e of etiquetas) {
        for (let f = 0; f < fragmentos; f++) {
          const conf = bruto[f * nClases + e.i]
          if (conf >= (data.limiar ?? 0.1)) {
            resultados.push({ ...e, fragmento: f, confianza: conf, xeo: xeo ? xeo[e.i] : null })
          }
        }
      }
      resultados.sort((a, b) => b.confianza - a.confianza)
      postMessage({ tipo: 'prediccion', resultados, ms, nClases, fragmentos })
    }
  } catch (e) {
    postMessage({ tipo: 'erro', mensaxe: e.message, pila: e.stack })
  }
}
