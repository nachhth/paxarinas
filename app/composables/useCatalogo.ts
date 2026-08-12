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

/** Nome preferente: galego se o hai, e se non o mellor dispoñible. */
export function nomeMostrado(e: Especie) {
  return e.nomes.gl ?? e.nomes.es ?? e.nomes.en ?? e.cientifico
}
