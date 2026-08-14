import type { Especie } from '~/types/catalogo'

/**
 * Descarga todas as fotos grandes e os cantos para que a app funcione sen
 * cobertura.
 *
 * Non se escribe na Cache API directamente: pídense os ficheiros con `fetch` e
 * dáselle ao service worker que os garde nas súas propias cachés, coas regras
 * CacheFirst que xa existen. Así hai un só sitio que decide onde vai cada cousa;
 * duplicalo aquí faría que un cambio en nuxt.config deixase orfos os ficheiros
 * baixados por este camiño.
 */

/** Descargas simultáneas. Máis non acelera e satura as conexións malas. */
const PARALELAS = 6

export type EstadoDescarga = 'inactivo' | 'descargando' | 'feito' | 'erro' | 'sen-sw'

/**
 * Que rutas ten xa gardadas o dispositivo, mirando en TODAS as cachés.
 *
 * Recórrense as claves unha soa vez e faise un conxunto, en vez de preguntar
 * `caches.match` por cada un dos ~1.250 ficheiros: aquilo son 1.250 consultas e
 * nótase. E vaise por todas as cachés en vez de abrir as dúas por nome, que é a
 * lección que deixou o modelo de son: o día que se reparta doutro xeito, isto
 * segue valendo.
 */
async function rutasGardadas(): Promise<Set<string>> {
  const gardadas = new Set<string>()
  if (typeof caches === 'undefined') return gardadas
  for (const nome of await caches.keys()) {
    const c = await caches.open(nome)
    for (const pedido of await c.keys()) {
      gardadas.add(new URL(pedido.url).pathname)
    }
  }
  return gardadas
}

export function useDescargaOffline(especies: Especie[]) {
  const estado = ref<EstadoDescarga>('inactivo')
  const feitos = ref(0)
  const fallos = ref(0)
  const bytes = ref(0)
  const cancelado = ref(false)
  /** Canto hai xa no dispositivo. `null` mentres non se comprobou. */
  const gardados = ref<number | null>(null)
  /** Cantos ficheiros pide esta pasada. É sobre este número que se mide o avance. */
  const aBaixar = ref(0)

  const urls = computed(() => [
    ...especies.filter(e => e.foto).map(e => e.foto!.grande),
    ...especies.flatMap(e => e.cantos.map(c => c.ficheiro)),
  ])

  const total = computed(() => urls.value.length)
  // Sobre o que se pide nesta pasada e non sobre o total: retomando unha
  // descarga á que lle faltaban cen ficheiros, medir sobre 1.247 daría un 8% e
  // parecería que non avanza.
  const porcentaxe = computed(() =>
    aBaixar.value ? Math.round((feitos.value / aBaixar.value) * 100) : 0)

  /** O que falta de verdade. Mentres non se comprobou, todo. */
  const pendentes = computed(() =>
    gardados.value === null ? total.value : total.value - gardados.value)

  /**
   * Conta o que xa está baixado.
   *
   * Sen isto o botón ofrecía os 1.247 ficheiros aínda téndoos todos, e unha
   * descarga cortada pola metade volvía empezar de cero. Ademais, ao cambiaren
   * os nomes dos cantos (agora hai canto e reclamo por especie), o que había
   * gardado do formato vello xa non conta: aquí vese, en vez de ter que fiarse.
   */
  async function revisar() {
    try {
      const gardadas = await rutasGardadas()
      gardados.value = urls.value.filter(u => gardadas.has(u)).length
    } catch {
      gardados.value = null
    }
  }

  async function baixa(url: string) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(String(r.status))
      // Hai que consumir o corpo: se non, a resposta non chega a rematar e o
      // service worker non a garda.
      const b = await r.blob()
      bytes.value += b.size
    } catch {
      fallos.value++
    } finally {
      feitos.value++
    }
  }

  async function descargar() {
    if (estado.value === 'descargando') return

    if (!navigator.serviceWorker?.controller) {
      // Sen service worker activo as descargas non se gardarían en ningures.
      estado.value = 'sen-sw'
      return
    }

    cancelado.value = false
    feitos.value = 0
    fallos.value = 0
    bytes.value = 0
    estado.value = 'descargando'

    // Só o que falta: retomar unha descarga cortada non ten por que volver pedir
    // 38 MB que xa están no dispositivo.
    const gardadas = await rutasGardadas()
    const cola = urls.value.filter(u => !gardadas.has(u))
    aBaixar.value = cola.length

    const obreiros = Array.from({ length: PARALELAS }, async () => {
      while (cola.length && !cancelado.value) {
        await baixa(cola.pop()!)
      }
    })

    await Promise.all(obreiros)
    await revisar()
    estado.value = cancelado.value ? 'inactivo' : (fallos.value ? 'erro' : 'feito')
  }

  function cancelar() {
    cancelado.value = true
  }

  return {
    estado, feitos, fallos, bytes, total, porcentaxe,
    gardados, pendentes, aBaixar, revisar, descargar, cancelar,
  }
}

/** Espazo que a app xa ten reservado no dispositivo, se o navegador o di. */
export async function espazoUsado(): Promise<number | null> {
  if (!navigator.storage?.estimate) return null
  const { usage } = await navigator.storage.estimate()
  return usage ?? null
}

export function formatoMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
