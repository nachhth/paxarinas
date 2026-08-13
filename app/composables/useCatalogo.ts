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
