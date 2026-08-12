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

export function useDescargaOffline(especies: Especie[]) {
  const estado = ref<EstadoDescarga>('inactivo')
  const feitos = ref(0)
  const fallos = ref(0)
  const bytes = ref(0)
  const cancelado = ref(false)

  const urls = computed(() => [
    ...especies.filter(e => e.foto).map(e => e.foto!.grande),
    ...especies.filter(e => e.canto).map(e => e.canto!.ficheiro),
  ])

  const total = computed(() => urls.value.length)
  const porcentaxe = computed(() =>
    total.value ? Math.round((feitos.value / total.value) * 100) : 0)

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

    const cola = [...urls.value]
    const obreiros = Array.from({ length: PARALELAS }, async () => {
      while (cola.length && !cancelado.value) {
        await baixa(cola.pop()!)
      }
    })

    await Promise.all(obreiros)
    estado.value = cancelado.value ? 'inactivo' : (fallos.value ? 'erro' : 'feito')
  }

  function cancelar() {
    cancelado.value = true
  }

  return { estado, feitos, fallos, bytes, total, porcentaxe, descargar, cancelar }
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
