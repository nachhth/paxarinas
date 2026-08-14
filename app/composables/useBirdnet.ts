import { useCatalogo } from '~/composables/useCatalogo'
import { modeloNoDispositivo } from '~/composables/usePrecargaSon'
import type { Especie } from '~/types/catalogo'

/**
 * Identificación de aves polo son, con BirdNET corrivo enteiro no dispositivo.
 *
 * Tres decisións que non convén revertir sen saber por que:
 *
 * **O modelo NUNCA vai no precache.** Son 49 MB fronte aos ~16 MB que custa
 * instalar a app enteira. Baixa baixo demanda e coa mesma pauta que
 * `/sen-conexion`: pídese con `fetch` (dentro do worker) e déixase que o service
 * worker o garde coas regras `CacheFirst` de `nuxt.config.ts`. Non se escribe na
 * Cache API desde aquí; se se duplicasen os nomes de caché, calquera cambio na
 * configuración deixaría orfo o descargado por esta vía.
 *
 * **Sen WebGL nin WebGPU isto non arranca.** Non degrada: falla. A rede son
 * 0,8 GFLOPs por fragmento e o backend de CPU de TF.js tarda decenas de
 * segundos. Detéctase antes de baixar nada e dise.
 *
 * **O filtro ás especies galegas é o que fai isto útil.** BirdNET ten 6.522
 * clases de todo o mundo; en Galicia hai 465 do catálogo, e acotando ao mes en
 * curso quedan ~400 (uns 305 se se deixan fóra as raras). Iso é o que non fai
 * Merlin, e é onde está o valor: un paporrubio nunca compite cun paxaro
 * australiano.
 *
 * O mel-espectrograma calcúlase en `public/birdnet/melspec.js`, escrito neste
 * proxecto; o modelo é a conversión oficial a TFJS de BirdNET (Kahl et al.,
 * CC BY-NC-SA 4.0) coas capas do espectrograma retiradas. Ver
 * `etl/birdnet/README.md`.
 */

/** 3 s a 48 kHz: a fiestra que espera BirdNET. */
export const MOSTRAS_FRAGMENTO = 144000
export const SAMPLE_RATE = 48000

/** O que hai que baixar a primeira vez. Compróbase de verdade ao descargar. */
export const BYTES_MODELO = 51_500_000

export type EstadoBirdnet =
  | 'inicial'      // aínda non se comprobou nada
  | 'sen-gpu'      // nin WebGL nin WebGPU: aquí non hai nada que facer
  | 'sen-modelo'   // hai GPU, falta descargar
  | 'cargando'
  | 'listo'
  | 'gravando'
  | 'analizando'
  | 'erro'

export interface Deteccion {
  especie: Especie
  /** Saída da sigmoide do modelo, en [0, 1]. */
  confianza: number
  /** Segundo no que empeza o fragmento onde mellor soou. */
  segundo: number
  /** false se a especie non ten citas en Galicia neste mes. */
  noMes: boolean
}

interface Galegas {
  especies: { i: number, cientifico: string }[]
}

/**
 * Hai algún backend de GPU utilizable?
 *
 * Non vale con mirar se `navigator.gpu` existe: nun Chromium coa aceleración
 * desactivada o obxecto segue aí e `requestAdapter()` devolve null. Hai que
 * pedir o adaptador e crear o contexto de verdade, senón acabaríase ofrecendo
 * unha descarga de 49 MB que despois non se pode usar.
 */
export async function haiGpu(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const gpu = (navigator as any).gpu
    if (gpu?.requestAdapter && await gpu.requestAdapter()) return true
  } catch { /* seguimos por WebGL */ }
  try {
    const lenzo = document.createElement('canvas')
    return !!(lenzo.getContext('webgl2') || lenzo.getContext('webgl'))
  } catch {
    return false
  }
}

export function useBirdnet() {
  const catalogo = useCatalogo()

  const estado = ref<EstadoBirdnet>('inicial')
  const erro = ref<string | null>(null)
  const bytesBaixados = ref(0)
  const progreso = ref(0)
  const backend = ref<string | null>(null)
  const gpu = ref<string | null>(null)
  const deteccions = ref<Deteccion[]>([])
  const segundosGravados = ref(0)
  const msAnalise = ref(0)
  const espazoLibre = ref<number | null>(null)
  /**
   * O modelo xa está no dispositivo, así que «cargar» non baixa nada.
   *
   * O estado desta páxina vive en `ref`s que morren ao navegar a outra ruta: ao
   * volver arrinca sempre en `inicial`. Sen preguntarlle á caché, a páxina
   * volvía ofrecer os 49 MB a quen xa os tiña. Non se trata de conservar o
   * estado —o worker si convén soltalo, son 49 MB en memoria de GPU—, senón de
   * mirar o dispositivo antes de ofrecer nada.
   */
  const daCache = ref(false)

  /**
   * O que se baixe **non** vai quedar gardado.
   *
   * Todo o de `/birdnet/` gárdao o service worker coa regra `CacheFirst`; se non
   * hai ningún controlando esta páxina, as peticións non pasan por el e os 49 MB
   * caen nun pozo: funcionan nesta sesión e ao volver pídense outra vez. Pasa
   * tras un despregue novo (o worker aínda instalándose), na primeira visita e
   * cunha recarga forzada.
   *
   * `/sen-conexion` xa o comprobaba antes de baixar nada; aquí non, e o efecto
   * era que a app pedía os mesmos 49 MB unha vez tras outra sen dicir por que.
   * Non se bloquea a descarga —quen queira identificar un paxaro agora ten
   * dereito a facelo—, pero dise antes, que é o que promete o resto da app.
   */
  const senGardar = ref(false)

  function haiServiceWorker() {
    return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller
  }

  let traballador: Worker | null = null
  let galegas: Galegas | null = null
  // Vai nun shallowRef e non nun `let`: `candidatas()` e `totalGalegas`
  // dependen del e non se recalcularían ao rematar a carga. Custou velo porque
  // non falla, simplemente amosa un cero.
  const porIndice = shallowRef(new Map<number, Especie>())
  let seguinte = 0
  const agardando = new Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>()

  let gravadora: MediaRecorder | null = null
  let pista: MediaStream | null = null
  let crono: ReturnType<typeof setInterval> | null = null
  let corte: ReturnType<typeof setTimeout> | null = null

  function pedir<T = any>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    if (!traballador) return Promise.reject(new Error('o worker non está en marcha'))
    const id = ++seguinte
    return new Promise<T>((resolve, reject) => {
      agardando.set(id, { resolve, reject })
      traballador!.postMessage({ ...msg, id }, transfer)
    })
  }

  function arrancaWorker() {
    if (traballador) return
    traballador = new Worker('/birdnet/worker.js')
    traballador.onmessage = ({ data }) => {
      // Estes dous son avisos de avance, non respostas: non levan `id` nin
      // pechan ningunha petición.
      if (data.tipo === 'progreso') { progreso.value = data.valor; return }
      if (data.tipo === 'bytes') { bytesBaixados.value = data.bytes; return }
      // Cada resposta devolve o `id` da súa petición. Antes resolvíase sempre a
      // máis antiga da cola, contando con que só houbese unha viva; era certo,
      // pero non estaba garantido por nada, e o día que deixase de selo as
      // respostas cruzaríanse en silencio.
      const p = agardando.get(data.id)
      if (!p) return
      agardando.delete(data.id)
      if (data.tipo === 'erro') p.reject(Object.assign(new Error(data.mensaxe), { codigo: data.codigo }))
      else p.resolve(data)
    }
    traballador.onerror = (e) => {
      erro.value = e.message || 'o worker de BirdNET non arrancou'
      estado.value = 'erro'
    }
  }

  /**
   * Comproba se hai GPU, canto espazo queda e **se o modelo xa está baixado**,
   * sen baixar nada. Se xa o está, prepárao só: non hai nada que pedirlle a
   * quen xa pagou os 49 MB.
   */
  async function comprobar() {
    if (!await haiGpu()) {
      estado.value = 'sen-gpu'
      return
    }
    if (navigator.storage?.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate()
        espazoLibre.value = quota != null ? quota - (usage ?? 0) : null
      } catch { espazoLibre.value = null }
    }
    senGardar.value = !haiServiceWorker()
    if (estado.value !== 'inicial') return
    if (await modeloNoDispositivo()) {
      daCache.value = true
      await cargar()
      return
    }
    if (estado.value === 'inicial') estado.value = 'sen-modelo'
  }

  /**
   * Baixa o modelo e déixao listo. Chámase só cando a persoa o pide
   * explicitamente, despois de ver canto pesa.
   */
  async function cargar() {
    if (estado.value === 'cargando' || estado.value === 'listo') return
    if (!await haiGpu()) { estado.value = 'sen-gpu'; return }

    erro.value = null
    progreso.value = 0
    bytesBaixados.value = 0
    // Compróbase outra vez e non se reusa o de `comprobar()`: entre abrir a
    // páxina e premer o botón, o service worker pode acabar de instalarse.
    senGardar.value = !haiServiceWorker()
    estado.value = 'cargando'

    try {
      // Sen isto o navegador pode tirar os 49 MB en canto lle apete o espazo.
      if (navigator.storage?.persist) {
        try { await navigator.storage.persist() } catch { /* non é bloqueante */ }
      }

      if (!galegas) {
        const r = await fetch('/birdnet/galegas.json')
        if (!r.ok) throw new Error(`non se puido baixar a lista galega (HTTP ${r.status})`)
        galegas = await r.json() as Galegas
        const porCientifico = new Map(catalogo.especies.map(e => [e.cientifico, e]))
        const mapa = new Map<number, Especie>()
        for (const g of galegas.especies) {
          const e = porCientifico.get(g.cientifico)
          if (e) mapa.set(g.i, e)
        }
        porIndice.value = mapa
      }

      arrancaWorker()
      const { traza } = await pedir<{ traza: any }>({ tipo: 'cargar' })
      backend.value = traza.backend
      gpu.value = traza.gpu
      bytesBaixados.value = traza.bytes
      estado.value = 'listo'
    } catch (e: any) {
      if (e?.codigo === 'sen-gpu') { estado.value = 'sen-gpu'; return }
      // Se fallou vindo da caché, esta xa non é fiable: volve a ofrecerse a
      // descarga completa e non un «só falta preparalo» que non se cumpriría.
      daCache.value = false
      erro.value = e?.message ?? String(e)
      estado.value = 'erro'
    }
  }

  /**
   * Grava do micrófono `segundos` e analiza.
   *
   * Devolve se se chegou a analizar algo de verdade. A páxina precísao: se non,
   * un permiso de micrófono denegado deixaba a lista de resultados baleira e
   * pintaba «non se recoñeceu ningunha especie, proba a achegarte» xusto debaixo
   * do erro real, aconsellando sobre unha gravación que nunca existiu.
   */
  async function gravar(
    segundos: number, soDoMes: boolean, soHabituais: boolean,
  ): Promise<boolean> {
    if (estado.value !== 'listo') return false
    erro.value = null
    deteccions.value = []
    segundosGravados.value = 0

    try {
      pista = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // O modelo adestrouse con audio cru: o procesado do navegador
          // recorta xusto o que interesa.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (e: any) {
      erro.value = e?.name === 'NotAllowedError'
        ? 'Non hai permiso para usar o micrófono.'
        : `Non se puido abrir o micrófono: ${e?.message ?? e}`
      return false
    }

    estado.value = 'gravando'
    const anacos: Blob[] = []

    try {
      const gravado = await new Promise<Blob>((resolve, reject) => {
        gravadora = new MediaRecorder(pista!)
        gravadora.ondataavailable = (ev) => { if (ev.data.size) anacos.push(ev.data) }
        gravadora.onerror = () => reject(new Error('fallou a gravación'))
        gravadora.onstop = () => resolve(new Blob(anacos, { type: gravadora?.mimeType }))
        gravadora.start()
        // O contador e o corte párase os dous en `deténCronos`, e non só dentro
        // do `setTimeout`: premendo «Parar» aos 2 s dunha gravación de 30, o
        // intervalo seguía vivo os 28 restantes e a seguinte gravación contaba o
        // dobre de rápido. Tamén quedaba correndo ao saír da páxina.
        crono = setInterval(() => { segundosGravados.value += 0.25 }, 250)
        corte = setTimeout(() => {
          if (gravadora?.state === 'recording') gravadora.stop()
        }, segundos * 1000)
      })

      pista.getTracks().forEach(t => t.stop())
      pista = null
      estado.value = 'analizando'
      return await analizar(gravado, soDoMes, soHabituais)
    } catch (e: any) {
      pista?.getTracks().forEach(t => t.stop())
      pista = null
      erro.value = e?.message ?? String(e)
      estado.value = 'listo'
      return false
    } finally {
      deténCronos()
    }
  }

  function deténCronos() {
    if (crono !== null) { clearInterval(crono); crono = null }
    if (corte !== null) { clearTimeout(corte); corte = null }
  }

  function parar() {
    if (gravadora?.state === 'recording') gravadora.stop()
  }

  /** Devolve se se analizou de verdade (ver `gravar`). */
  async function analizar(
    son: Blob, soDoMes: boolean, soHabituais: boolean,
  ): Promise<boolean> {
    // Decodifícase nun contexto de 48 kHz: así o remostrexo faino o navegador,
    // que é quen mellor o sabe facer, e o modelo recibe sempre o mesmo ritmo.
    const bruto = await son.arrayBuffer()
    const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
    const audio = await ctx.decodeAudioData(bruto)
    const canle = audio.getChannelData(0)

    const nFragmentos = Math.floor(canle.length / MOSTRAS_FRAGMENTO)
    if (nFragmentos < 1) {
      erro.value = `Fan falta polo menos 3 segundos de son (houbo ${(canle.length / SAMPLE_RATE).toFixed(1)} s).`
      estado.value = 'listo'
      return false
    }
    const pcm = canle.slice(0, nFragmentos * MOSTRAS_FRAGMENTO)

    const r = await pedir<{
      puntuacions: Float32Array, nFragmentos: number, nClases: number,
      msEspectro: number, msModelo: number
    }>({ tipo: 'predicir', pcm }, [pcm.buffer])

    msAnalise.value = r.msEspectro + r.msModelo
    deteccions.value = mellores(r, soDoMes, soHabituais)
    estado.value = 'listo'
    return true
  }

  /** Mes en curso, 0-11. */
  const mesActual = new Date().getMonth()

  function mellores(
    r: { puntuacions: Float32Array, nFragmentos: number, nClases: number },
    soDoMes: boolean,
    soHabituais: boolean,
  ): Deteccion[] {
    const mellor = new Map<number, { conf: number, frag: number }>()
    for (let f = 0; f < r.nFragmentos; f++) {
      const base = f * r.nClases
      for (const [i, especie] of porIndice.value) {
        if (soHabituais && especie.rara) continue
        const c = r.puntuacions[base + i]!
        const previo = mellor.get(i)
        if (!previo || previo.conf < c) mellor.set(i, { conf: c, frag: f })
      }
    }

    const saida: Deteccion[] = []
    for (const [i, { conf, frag }] of mellor) {
      const especie = porIndice.value.get(i)!
      // As especies sen fenoloxía fiable non se descartan nunca: descartalas
      // sería inventar. As que a teñen, só se hai algunha cita neste mes.
      const noMes = !especie.fenoloxia?.fiable || (especie.fenoloxia.meses[mesActual] ?? 0) > 0
      if (soDoMes && !noMes) continue
      saida.push({ especie, confianza: conf, segundo: frag * 3, noMes })
    }
    saida.sort((a, b) => b.confianza - a.confianza)
    return saida
  }

  /** Cantas candidatas quedan co filtro posto. É o número que xustifica todo isto. */
  function candidatas(soDoMes: boolean, soHabituais: boolean) {
    let n = 0
    for (const especie of porIndice.value.values()) {
      if (soHabituais && especie.rara) continue
      if (soDoMes && especie.fenoloxia?.fiable && !((especie.fenoloxia.meses[mesActual] ?? 0) > 0)) continue
      n++
    }
    return n
  }

  onScopeDispose(() => {
    parar()
    deténCronos()
    pista?.getTracks().forEach(t => t.stop())
    traballador?.terminate()
    traballador = null
    // Ao terminar o worker ninguén vai responder xa: sen isto, unha análise a
    // medio facer deixaba a promesa colgada para sempre e con ela todo o que
    // agardase por ela.
    for (const [id, p] of agardando) {
      agardando.delete(id)
      p.reject(new Error('a análise cancelouse ao saír da páxina'))
    }
  })

  return {
    estado, erro, progreso, bytesBaixados, backend, gpu,
    deteccions, segundosGravados, msAnalise, espazoLibre, daCache, senGardar,
    comprobar, cargar, gravar, parar, candidatas,
    totalGalegas: computed(() => porIndice.value.size),
    mesActual,
  }
}
