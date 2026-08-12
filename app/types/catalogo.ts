export interface Nomes {
  gl: string | null
  /** De onde sae o nome galego: Catalogue of Life, Wikidata ou (algún día) a RAG. */
  glFonte: string | null
  es: string | null
  en: string | null
  pt: string | null
}

/**
 * A atribución vai pegada á imaxe e non nunha táboa aparte, para que sexa
 * imposible mostrar unha foto sen dicir de quen é e baixo que licenza.
 */
export interface Foto {
  /** 250 px, para o listado. */
  mini: string
  /** 500 px, para a ficha. */
  grande: string
  autor: string | null
  licenza: string
  licenzaUrl: string | null
  /** Páxina do ficheiro en Commons. */
  orixe: string | null
}

export type Estatus =
  | 'residente' | 'estival' | 'invernante' | 'de paso' | 'escasa' | 'sen datos'

/**
 * `meses` é dato bruto: a porcentaxe das citas galegas que cae en cada mes,
 * de xaneiro a decembro. `estatus` é a interpretación dese dato mediante unha
 * heurística, non unha determinación experta — amósase sempre como estimación.
 */
export interface Fenoloxia {
  estatus: Estatus
  meses: number[]
  total: number
  /** false cando hai poucas citas para dicir nada (< 50). */
  fiable: boolean
}

/**
 * Gravación de xeno-canto, recortada a 15 s e recodificada a Opus. Como coas
 * fotos, a atribución vai pegada ao recurso. `lugar` e `pais` importan: moitas
 * especies teñen subespecies con voces distintas, e convén que se vexa de onde
 * saíu a gravación.
 */
export interface Canto {
  ficheiro: string
  autor: string | null
  licenza: string | null
  orixe: string | null
  lugar: string | null
  pais: string | null
  /** song, call, alarm call… tal como o etiquetou quen gravou. */
  tipo: string | null
}

export interface Especie {
  slug: string
  cientifico: string
  autoria: string | null
  orde: string | null
  familia: string | null
  xenero: string | null
  nomes: Nomes
  foto: Foto | null
  canto: Canto | null
  fenoloxia: Fenoloxia | null
  /** Nº de ocorrencias rexistradas en GBIF para Galicia. Serve de proxy de abundancia. */
  citas: number
  /** Menos de 10 citas: divagante, escapada de catividade ou erro de identificación. */
  rara: boolean
  gbifKey: number
}

export interface Catalogo {
  version: number
  fontes: string[]
  avisoFenoloxia: string
  total: number
  especies: Especie[]
}
