/**
 * Por onde pasaches: as fichas que abriches e o que che dixo o identificador.
 *
 * Serve para volver a algo que viches e non marcaches — o caso típico é o
 * paxaro que o son deu como probable e que non sabes se era. Vai no propio
 * dispositivo, coma as vistas, e bórrase desde «As miñas aves».
 *
 * Non é a listaxe de vistas nin quere selo: alí métese o que decides ti, aquí
 * anótase soa a túa pegada. Por iso se pode baleirar sen perder nada.
 */

const CHAVE = 'paxarinas:historial'

/** Cando se pasa de aquí bótanse os máis vellos. */
const TOPE = 80

export type Orixe = 'ficha' | 'son'

export interface Paso {
  slug: string
  orixe: Orixe
  /** ISO completo: dous pasos poden ser do mesmo día e a orde importa. */
  cando: string
  /** Cantas veces. Repetir non engade fila, actualiza esta. */
  veces: number
  /** Só en `son`: a confianza máis alta que deu o modelo. */
  confianza?: number
}

const pasos = ref<Paso[]>([])
const cargado = ref(false)

function garda() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify(pasos.value))
  } catch { /* Cota chea ou almacenamento bloqueado: o historial non é crítico. */ }
}

function válido(p: unknown): p is Paso {
  if (!p || typeof p !== 'object') return false
  const { slug, orixe, cando, veces } = p as Record<string, unknown>
  return typeof slug === 'string'
    && (orixe === 'ficha' || orixe === 'son')
    && typeof cando === 'string'
    && typeof veces === 'number' && Number.isFinite(veces)
}

function carga() {
  if (cargado.value || !import.meta.client) return
  cargado.value = true
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return
    const datos = JSON.parse(cru)
    if (Array.isArray(datos)) pasos.value = datos.filter(válido)
  } catch { /* Se non se pode ler, empézase baleiro. */ }
}

export function useHistorial() {
  onMounted(carga)

  /**
   * Anota un paso. Unha fila por especie e orixe: abrir cinco veces a mesma
   * ficha non ten que encher o historial con cinco liñas iguais.
   */
  function anota(slug: string, orixe: Orixe, confianza?: number) {
    if (!import.meta.client) return
    carga()

    const agora = new Date().toISOString()
    const antes = pasos.value.find(p => p.slug === slug && p.orixe === orixe)

    if (antes) {
      antes.cando = agora
      antes.veces += 1
      // Do son gárdase a mellor confianza, non a última: interesa canto chegou
      // a acertar o modelo con esa ave, non como soou a derradeira vez.
      if (confianza !== undefined) {
        antes.confianza = Math.max(antes.confianza ?? 0, confianza)
      }
      pasos.value = [...pasos.value]
    } else {
      pasos.value = [...pasos.value, {
        slug, orixe, cando: agora, veces: 1,
        ...(confianza === undefined ? {} : { confianza }),
      }]
    }

    if (pasos.value.length > TOPE) {
      pasos.value = [...pasos.value]
        .sort((a, b) => b.cando.localeCompare(a.cando))
        .slice(0, TOPE)
    }
    garda()
  }

  function esquece(slug: string, orixe: Orixe) {
    pasos.value = pasos.value.filter(p => !(p.slug === slug && p.orixe === orixe))
    garda()
  }

  function baleira() {
    pasos.value = []
    garda()
  }

  return { pasos, anota, esquece, baleira }
}
