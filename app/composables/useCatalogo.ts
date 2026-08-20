import bruto from '~~/data/especies.json'
import type { Catalogo, Especie } from '~/types/catalogo'

const catalogo = bruto as Catalogo

/**
 * O catálogo empótrase no bundle en tempo de compilación en vez de pedirse por
 * rede: así as fichas prerenderízanse e a app funciona sen conexión desde o
 * primeiro momento, que é o caso de uso real (no monte non hai cobertura).
 */
export function useCatalogo() {
  return catalogo
}

/** Normaliza para buscar sen depender de acentos nin maiúsculas. */
export function normaliza(t: string) {
  return t.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * Onde encadrar unha foto que hai que recortar para meter nunha tarxeta.
 *
 * Canto máis alongada é a foto, máis alto hai que buscar. Non é un capricho:
 * nunha foto vertical de ave a parte de abaixo adoita ser pouso, auga ou herba,
 * mentres que o paxaro —e sobre todo a cabeza, que é o que identifica— queda na
 * metade superior. Recortando polo centro, o azor amosaba só o lombo.
 *
 * É unha regra estatística, non unha detección: sen saber onde está o paxaro
 * ningunha regra acerta sempre. Acerta moito máis que o centro fixo.
 */
export function encadre(foto: { anchoGrande: number | null, altoGrande: number | null } | null) {
  const ancho = foto?.anchoGrande
  const alto = foto?.altoGrande
  if (!ancho || !alto) return '50% 30%'

  const proporcion = alto / ancho
  // 1.0 (cadrada) → 50%; 1.33 → 32%; 1.63 → 15%. Nunca por debaixo do 12%,
  // que xa cortaría as patas nas moi alongadas.
  const y = Math.min(50, Math.max(12, 50 - (proporcion - 1) * 55))
  return `50% ${Math.round(y)}%`
}

/** Nome preferente: galego se o hai, e se non o mellor dispoñible. */
export function nomeMostrado(e: Especie) {
  return e.nomes.gl ?? e.nomes.es ?? e.nomes.en ?? e.cientifico
}

/**
 * Porcentaxe das citas anuais que ten que caer nun mes para dalo por presente.
 *
 * Nunha especie repartida por igual cada mes levaría o 8,3%: esíxese a metade.
 * Vive aquí e non en cada páxina porque estaba escrito tres veces con dous
 * valores distintos —a portada e o identificador esixían 4, o mapa 3— e a mesma
 * especie aparecía no filtro de agosto nunha páxina e non na outra. Non era un
 * matiz: eran dous filtros que se presentan á xente coma un só.
 */
export const LIMIAR_MES = 4

/**
 * Vese esta especie no mes dado?
 *
 * `senDatos` é o que se responde cando a fenoloxía non é fiable (menos de 50
 * citas), e as dúas respostas son lexítimas segundo quen pregunte:
 *
 * - `true` no identificador e no mapa, onde a lista xa vén acotada por outros
 *   criterios: descartar unha especie por non saber dela sería inventar.
 * - `false` na portada, onde este filtro serve para acurtar 517 fichas: meter aí
 *   todas as que non teñen dato deixaríao sen efecto.
 */
export function veseNoMes(e: Especie, mes: number, senDatos = true): boolean {
  const f = e.fenoloxia
  if (!f || !f.fiable) return senDatos
  return (f.meses[mes] ?? 0) >= LIMIAR_MES
}

/**
 * A URL, se se pode poñer nun `href` sen perigo; se non, `null`.
 *
 * As licenzas e as páxinas de orixe das fotos veñen de `extmetadata` de Commons,
 * que sae das plantillas do wikitexto de cada ficheiro: edítaas calquera. Vue
 * non sanea `href`, así que un `javascript:` alí sería código executable a un
 * clic. O ETL xa filtra por esquema ao xerar os datos (`etl/common.py`), pero
 * isto compróbase tamén aquí a propósito: o catálogo regenérase só e vai
 * versionado, e a última liña de defensa ten que estar onde se pinta.
 */
export function ligazon(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url.trim()) ? url : null
}

/**
 * Un número con puntos de milleiro: 8.638.
 *
 * Faise a man e non con `toLocaleString('gl-ES')`, que era o que había. O
 * problema é que non todos os motores coñecen o galego: ao prerenderizar, Node
 * escribía «8.638», e no navegador saía «8638». Vue detectaba a diferenza ao
 * hidratar e reescribía o nodo —«Hydration completed but contains
 * mismatches»—, e o número cambiaba diante de quen o estea a ler.
 *
 * Con separador propio o resultado é o mesmo en todas partes, que é o que
 * importa nun sitio que se xera unha vez e se serve estático.
 */
export function numero(n: number): string {
  // Todo o que non sexa un número acaba en '0' e non nun «NaN» na ficha. Aquí
  // sempre chegan contas de citas de GBIF, pero un dato que falte non ten por
  // que verse coma un erro do programa.
  if (!Number.isFinite(n)) return '0'

  const enteiro = Math.trunc(Math.abs(n))
  // O punto vai entre cada tres díxitos contando desde a dereita: `\B` evita
  // pórllo diante do primeiro, e o `(?!\d)` que os grupos se conten desde o
  // final e non desde o principio.
  const conPuntos = String(enteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return n < 0 ? `-${conPuntos}` : conPuntos
}
