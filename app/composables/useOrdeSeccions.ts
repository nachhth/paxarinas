/**
 * A orde das seccións da ficha, ao gusto de quen usa a app.
 *
 * Non todo o mundo le unha ficha igual: a quen lle interesan os nomes noutros
 * idiomas non ten por que baixar por diante de sete tarxetas cada vez. A orde
 * escóllese unha vez e vale para as 518 fichas.
 *
 * **Reordénase con `order` de CSS, non movendo nodos.** As seccións teñen cada
 * unha os seus `v-if` e o seu contido; sacalas a compoñentes soltos só para
 * poder metelas nun `v-for` sería refacer a ficha enteira para gañar o mesmo.
 * A contrapartida está anotada onde se usa: a orde do DOM segue sendo a de
 * partida, así que un lector de pantalla le na orde orixinal. Por iso a orde
 * escollida NON cambia nada do contido nin agocha nada — só sobe e baixa.
 *
 * Gárdase en `localStorage`, coma a listaxe de aves vistas: sen contas e sen
 * saír do dispositivo.
 */

const CHAVE = 'paxarinas:orde-seccions'

/** Identificador estable de cada sección. Non se renomean: son a clave gardada. */
export type SeccionFicha =
  | 'son' | 'fotos' | 'que-e' | 'conservacion' | 'como-e' | 'parecidas'
  | 'clasificacion' | 'nome-galego' | 'idiomas' | 'cando' | 'onde' | 'galicia'

/** A orde de fábrica, que é a que se pensou para quen chega por primeira vez. */
export const ORDE_INICIAL: SeccionFicha[] = [
  'son', 'fotos', 'que-e', 'conservacion', 'como-e', 'parecidas',
  'clasificacion', 'nome-galego', 'idiomas', 'cando', 'onde', 'galicia',
]

/** Como se chama cada sección na lista de ordenar. */
export const NOMES_SECCION: Record<SeccionFicha, string> = {
  'son': 'Como soa',
  'fotos': 'Máis fotos',
  'que-e': 'Que é',
  'conservacion': 'Estado de conservación',
  'como-e': 'Como é',
  'parecidas': 'Fáciles de confundir',
  'clasificacion': 'Clasificación',
  'nome-galego': 'Nome galego',
  'idiomas': 'Noutros idiomas',
  'cando': 'Cando se ve',
  'onde': 'Onde se ve',
  'galicia': 'En Galicia',
}

/**
 * Sanea o que veña de `localStorage`.
 *
 * Non se dá por boa a lista gardada tal cal: se nunha versión futura se engade
 * unha sección, as fichas de quen xa ordenou non a amosarían nunca —quedaría sen
 * posición—, e se se quita unha, sobraría. Consérvase a orde do que segue a
 * existir e engádese ao final o que apareza novo.
 */
function sanea(gardado: unknown): SeccionFicha[] {
  const lista = Array.isArray(gardado) ? gardado : []
  const validas = lista.filter(
    (s): s is SeccionFicha => typeof s === 'string' && (ORDE_INICIAL as string[]).includes(s))
  const vistas = new Set(validas)
  return [...validas, ...ORDE_INICIAL.filter(s => !vistas.has(s))]
}

export function useOrdeSeccions() {
  const orde = useState<SeccionFicha[]>('orde-seccions', () => [...ORDE_INICIAL])
  /** Está a orde tocada respecto da de fábrica? Serve para ofrecer o «restaurar». */
  const tocada = computed(() => orde.value.join() !== ORDE_INICIAL.join())

  /**
   * Lese no cliente e non no `useState` inicial: en prerenderizado non hai
   * `localStorage`, e devolver alí unha orde distinta da do servidor rompería a
   * hidratación das 518 fichas.
   */
  function carga() {
    if (!import.meta.client) return
    try {
      const cru = localStorage.getItem(CHAVE)
      if (cru) orde.value = sanea(JSON.parse(cru))
    } catch {
      // Almacenamento bloqueado ou JSON estragado: quédase a orde de fábrica.
    }
  }

  function garda() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(CHAVE, JSON.stringify(orde.value))
    } catch { /* non é motivo para romper a ficha */ }
  }

  /** Move unha sección un posto arriba (-1) ou abaixo (+1). */
  function move(id: SeccionFicha, salto: number) {
    const de = orde.value.indexOf(id)
    const a = de + salto
    if (de < 0 || a < 0 || a >= orde.value.length) return
    const nova = [...orde.value]
    nova.splice(a, 0, ...nova.splice(de, 1))
    orde.value = nova
    garda()
  }

  /** Lévaa a unha posición concreta. Úsao o arrastre. */
  function colocaEn(id: SeccionFicha, posicion: number) {
    const de = orde.value.indexOf(id)
    const a = Math.max(0, Math.min(orde.value.length - 1, posicion))
    if (de < 0 || de === a) return
    const nova = [...orde.value]
    nova.splice(a, 0, ...nova.splice(de, 1))
    orde.value = nova
  }

  function restaura() {
    orde.value = [...ORDE_INICIAL]
    garda()
  }

  /** O valor de `order` de CSS para unha sección. */
  function posicion(id: SeccionFicha) {
    const i = orde.value.indexOf(id)
    return i < 0 ? ORDE_INICIAL.length : i
  }

  return { orde, tocada, carga, garda, move, colocaEn, restaura, posicion }
}
