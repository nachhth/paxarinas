/* Mel-espectrograma de BirdNET calculado en JavaScript puro.
 *
 * POR QUE EXISTE ESTE FICHEIRO
 * ----------------------------
 * O modelo de BirdNET trae a STFT dentro do grafo, nunha capa Keras
 * `MelSpecLayerSimple`. Ao converter a TensorFlow.js esa capa hai que
 * reimplementala en JS, e a implementación oficial de Cornell usa
 * `tf.signal.stft`, que en WebGL é un DFT O(n²) e en CPU nin sequera existe como
 * kernel. A demo de terceiros na que se apoiaba o spike resolvíao con kernels
 * propios en GLSL e WGSL — código sen licenza declarada.
 *
 * Aquí a capa mel sáese do modelo (ver `etl/birdnet/converter_espectro.mjs`) e
 * calcúlase aquí, en CPU, con FFT propia. Consecuencias:
 *   · non queda dependencia de código sen licenza;
 *   · o espectrograma non precisa WebGL nin WebGPU (só a rede convolucional);
 *   · a FFT é O(n log n) en vez de O(n²).
 *
 * QUE HAI QUE RESPECTAR AO TOCAR ISTO
 * -----------------------------------
 * A aritmética replica paso a paso a `MelSpecLayerSimple` oficial (BirdNET-
 * Analyzer, MIT). Calquera desvío cambia as predicións sen dar erro:
 *
 *   1. normalización a [-1, 1] sobre o fragmento ENTEIRO, non por fiestra;
 *   2. fiestra de Hann PERIÓDICA (denominador N, non N-1), que é a que devolve
 *      `tf.signal.hannWindow` para lonxitudes pares;
 *   3. do resultado da STFT tómase a PARTE REAL, non o módulo. Iso é o que fai
 *      o `tf.cast(spec, 'float32')` da capa oficial, que descarta a compoñente
 *      imaxinaria. Non é o que faría un espectrograma de libro, pero é o que
 *      viu o modelo ao adestrarse tal e como Cornell o publica;
 *   4. proxección mel ANTES de elevar ao cadrado (os valores aínda teñen signo);
 *   5. expoñente 1/(1+exp(magnitude_scaling)) co escalar ADESTRADO, non co 1.23
 *      do inicializador;
 *   6. as bandas mel van invertidas (`tf.reverse`) e os eixos transpostos.
 *
 * `medir_melspec.mjs` compara esta implementación coa oficial en TensorFlow.js.
 *
 * Parámetros e bancos de filtros: BirdNET GLOBAL 6K v2.4 (Kahl et al.),
 * CC BY-NC-SA 4.0. Este código: a licenza do proxecto.
 */

;(function (raiz) {
  'use strict'

  /** Táboas por lonxitude de fiestra; construílas custa e reutilízanse sempre. */
  const cacheFFT = new Map()

  function taboas (frameLength) {
    let t = cacheFFT.get(frameLength)
    if (t) return t

    const medio = frameLength / 2 // tamaño da FFT complexa
    if (medio < 2 || (medio & (medio - 1)) !== 0) {
      throw new Error(`a fiestra ten que ser potencia de dous: ${frameLength}`)
    }

    // Permutación por inversión de bits para a FFT iterativa
    const bits = Math.log2(medio)
    const rev = new Uint32Array(medio)
    for (let i = 0; i < medio; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
      rev[i] = r
    }

    // Xiros da FFT complexa de `medio` puntos
    const cos = new Float32Array(medio / 2)
    const sin = new Float32Array(medio / 2)
    for (let k = 0; k < medio / 2; k++) {
      const a = (-2 * Math.PI * k) / medio
      cos[k] = Math.cos(a)
      sin[k] = Math.sin(a)
    }

    // Fiestra de Hann periódica
    const hann = new Float32Array(frameLength)
    for (let i = 0; i < frameLength; i++) {
      hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameLength)
    }

    // Xiros do desdobramento real→complexo (bin k de 0 a medio)
    const cosR = new Float32Array(medio + 1)
    const sinR = new Float32Array(medio + 1)
    for (let k = 0; k <= medio; k++) {
      const a = (-2 * Math.PI * k) / frameLength
      cosR[k] = Math.cos(a)
      sinR[k] = Math.sin(a)
    }

    t = {
      medio,
      bits,
      rev,
      cos,
      sin,
      hann,
      cosR,
      sinR,
      re: new Float32Array(medio),
      im: new Float32Array(medio),
    }
    cacheFFT.set(frameLength, t)
    return t
  }

  /**
   * Parte real da RFFT dunha fiestra do sinal, con Hann aplicada.
   *
   * Empaqueta as N mostras reais en N/2 complexas (pares na parte real, impares
   * na imaxinaria), fai unha FFT complexa de N/2 puntos e desdobra. É a metade
   * de traballo que unha FFT complexa de N puntos.
   *
   * Escribe en `saida[0..maxBin]` e non calcula os bins de máis arriba: o banco
   * mel de BirdNET só chega ata 3 kHz nunha canle e ata 15 kHz na outra, así que
   * boa parte do espectro non se mira nunca.
   */
  function rfftReal (sinal, inicio, t, saida, maxBin) {
    const { medio, rev, cos, sin, hann, cosR, sinR, re, im } = t

    // Empaquetado + fiestra + inversión de bits, todo nunha pasada
    for (let k = 0; k < medio; k++) {
      const r = rev[k]
      const i2 = 2 * k
      re[r] = sinal[inicio + i2] * hann[i2]
      im[r] = sinal[inicio + i2 + 1] * hann[i2 + 1]
    }

    // FFT complexa iterativa (Cooley-Tukey, decimación en tempo)
    for (let paso = 1; paso < medio; paso <<= 1) {
      const salto = paso << 1
      const escala = medio / salto
      for (let inicioG = 0; inicioG < medio; inicioG += salto) {
        for (let j = 0; j < paso; j++) {
          const a = inicioG + j
          const b = a + paso
          const w = j * escala
          const wr = cos[w]
          const wi = sin[w]
          const br = re[b]
          const bi = im[b]
          const tr = br * wr - bi * wi
          const ti = br * wi + bi * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }

    // Desdobramento: X[k] = (Z[k] + conj(Z[N/2-k]))/2 + e^{-2πik/N}·(Z[k] − conj(Z[N/2-k]))/(2i)
    // Só interesa a parte real.
    const tope = Math.min(maxBin, medio)
    for (let k = 0; k <= tope; k++) {
      // Os dous índices dan a volta: no bin de Nyquist (k = medio) as dúas
      // metades son a mesma, Z[0]. Sen o módulo saíase do array e daba NaN.
      const i = k % medio
      const j = (medio - k) % medio
      const ar = re[i]; const ai = im[i]
      const br = re[j]; const bi = -im[j]
      saida[k] = 0.5 * (ar + br + cosR[k] * (ai - bi) + sinR[k] * (ar - br))
    }
  }

  /** Ata que bin do espectro chega o banco de filtros. */
  function topeBin (filtro) {
    let tope = 0
    for (const b of filtro.bandas) {
      if (b.pesos.length) tope = Math.max(tope, b.inicio + b.pesos.length - 1)
    }
    return tope
  }

  /**
   * Prepara os parámetros que veñen de `public/birdnet/melspec.json` nunha forma
   * cómoda para o bucle: bancos de filtros aplanados a arrays tipados.
   */
  function preparar (params) {
    const canles = params.canles.map((c) => {
      const inicios = new Int32Array(c.filtro.nBandas)
      const lonxitudes = new Int32Array(c.filtro.nBandas)
      const pesos = []
      for (let b = 0; b < c.filtro.nBandas; b++) {
        inicios[b] = c.filtro.bandas[b].inicio
        lonxitudes[b] = c.filtro.bandas[b].pesos.length
        for (const p of c.filtro.bandas[b].pesos) pesos.push(p)
      }
      const desprazamentos = new Int32Array(c.filtro.nBandas)
      let acc = 0
      for (let b = 0; b < c.filtro.nBandas; b++) { desprazamentos[b] = acc; acc += lonxitudes[b] }
      return {
        frameLength: c.frameLength,
        frameStep: c.frameStep,
        fotogramas: c.fotogramas,
        nBandas: c.filtro.nBandas,
        // O expoñente vén precalculado, pero recalcúlase se falta.
        expo: c.expoñente != null ? c.expoñente : 1 / (1 + Math.exp(c.magScale)),
        inicios,
        lonxitudes,
        desprazamentos,
        pesos: Float32Array.from(pesos),
        maxBin: topeBin(c.filtro),
        espectro: new Float32Array(c.frameLength / 2 + 1),
      }
    })

    const [bandas, fotogramas, nCanles] = params.forma
    if (nCanles !== canles.length) {
      throw new Error(`melspec.json: a forma di ${nCanles} canles e hai ${canles.length}`)
    }
    return { mostras: params.mostras, forma: params.forma, bandas, fotogramas, canles }
  }

  /**
   * Calcula o espectrograma dun ou varios fragmentos de 3 s.
   *
   * @param {Float32Array} pcm  audio a 48 kHz, múltiplo de 144000 mostras
   * @param {object} preparado  saída de `preparar()`
   * @returns {{datos: Float32Array, forma: number[]}} tensor [n, 96, 511, 2]
   *          listo para `tf.tensor(datos, forma)`
   */
  function espectrograma (pcm, preparado) {
    const { mostras, bandas, fotogramas, canles } = preparado
    const n = pcm.length / mostras
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`o audio ten ${pcm.length} mostras e non é múltiplo de ${mostras}`)
    }

    const nCanles = canles.length
    const porFragmento = bandas * fotogramas * nCanles
    const datos = new Float32Array(n * porFragmento)

    // Reutilízase entre fragmentos: guarda a fiestra actual xa normalizada.
    const normalizado = new Float32Array(mostras)

    for (let f = 0; f < n; f++) {
      const base = f * mostras

      // 1. Normalización a [-1, 1] sobre o fragmento enteiro
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < mostras; i++) {
        const v = pcm[base + i]
        if (v < min) min = v
        if (v > max) max = v
      }
      const escala = 2 / (max - min + 0.000001)
      for (let i = 0; i < mostras; i++) {
        normalizado[i] = (pcm[base + i] - min) * escala - 1
      }

      for (let c = 0; c < nCanles; c++) {
        const canle = canles[c]
        const { espectro, inicios, lonxitudes, desprazamentos, pesos, expo } = canle
        const saidaBase = f * porFragmento + c

        for (let t = 0; t < fotogramas; t++) {
          rfftReal(normalizado, t * canle.frameStep, taboas(canle.frameLength),
            espectro, canle.maxBin)

          // 2. Proxección mel (esparsa) e non linearidade
          for (let b = 0; b < bandas; b++) {
            const ini = inicios[b]
            const len = lonxitudes[b]
            const off = desprazamentos[b]
            let v = 0
            for (let k = 0; k < len; k++) v += espectro[ini + k] * pesos[off + k]
            // ^2 e despois ^expo, tal e como fai a capa oficial
            const m = Math.pow(v * v, expo)
            // 3. Bandas invertidas e eixos transpostos: [fotograma, banda] →
            //    [banda, fotograma], coa canle como última dimensión.
            datos[saidaBase + ((bandas - 1 - b) * fotogramas + t) * nCanles] = m
          }
        }
      }
    }

    return { datos, forma: [n, bandas, fotogramas, nCanles] }
  }

  const api = { preparar, espectrograma, rfftReal, taboas }
  raiz.Melspec = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof self !== 'undefined' ? self : globalThis)
