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
  /**
   * Medidas reais da grande. O 13% das fotos son verticais, e recortalas a un
   * oco apaisado deixaba fóra a cabeza do paxaro; coas medidas pódese amosar
   * enteira e reservarlle o oco exacto.
   */
  anchoGrande: number | null
  altoGrande: number | null
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

/**
 * Foto da galería. A diferenza de `Foto`, esta non se descarga: `url` apunta a
 * Commons e só se ve con conexión. Vive en public/data/galeria/<slug>.json,
 * fóra do catálogo e fóra do precache.
 */
export interface FotoGaleria {
  /** 330 px, a da grella. */
  url: string
  /** 960 px, a que se ve ao ampliar. Igual á anterior se a orixinal é menor. */
  urlGrande: string
  autor: string | null
  licenza: string | null
  licenzaUrl: string | null
  orixe: string | null
  /**
   * Macho, femia, xuvenil… deducido das subcategorías de Commons e do título
   * do ficheiro por `etl/commons_sexos.py`. Ausente na maioría das fotos, e
   * iso é deliberado: unha etiqueta de sexo errada nunha guía leva a descartar
   * a especie correcta, así que ante a dúbida non se etiqueta.
   */
  plumaxe?: Plumaxe
}

export type Plumaxe =
  | 'macho' | 'femia' | 'xuvenil' | 'eclipse' | 'nupcial' | 'inverno'

/**
 * O ficheiro de galería, tal como o len `GaleriaEspecie`.
 *
 * `grupos` só vén cando hai polo menos dous grupos con dúas fotos cada un.
 * Con menos non se agrupa: un título «Macho» enriba dunha foto solta non
 * aporta nada, e un grupo só non se pode comparar con ningún outro.
 */
export interface Galeria {
  cientifico: string
  fonte: string
  fotos: FotoGaleria[]
  grupos?: Plumaxe[]
}

export type Tamano =
  | 'moi pequena' | 'pequena' | 'mediana' | 'grande' | 'moi grande' | 'enorme'

/**
 * Rasgos de AVONET (CC BY 4.0). É o que permite chegar a unha especie sen saber
 * o seu nome, que é o uso real: ves un paxaro e queres saber cal é.
 *
 * Non hai cor: non existe ningunha fonte aberta que a recolla para as 11.000
 * especies, e inventala nunha ferramenta de identificación sería peor que non
 * telo. Queda como traballo de curación manual.
 */
export interface Rasgos {
  /** Gramos. */
  masa: number | null
  /** Milímetros. */
  ala: number | null
  tamano: Tamano | null
  /** «coma un pardal»: a xente non estima pesos, compara. */
  comparanza: string | null
  habitat: string | null
  habitatOrixe: string | null
  come: string | null
  nichoOrixe: string | null
}

/** Parágrafo de presentación, de Wikipedia. CC BY-SA: a ligazón é obrigatoria. */
export interface Descricion {
  texto: string
  /** 'gl' ou 'es': hai 51 especies sen artigo en galego. */
  idioma: string
  titulo: string
  url: string
}

/** Categoría da Lista Vermella da UICN. */
export interface Conservacion {
  /** LC, NT, VU, EN, CR, EW, EX, DD, NE. */
  codigo: string
  texto: string
  /** 0 = pouco preocupante … 6 = extinguida. -1 = sen avaliar. */
  gravidade: number
  /** Vulnerable ou peor. */
  ameazada: boolean
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
  rasgos: Rasgos | null
  descricion: Descricion | null
  conservacion: Conservacion | null
  /**
   * Grupos de plumaxe que ten a galería desta especie. Baleiro na maioría.
   * Está no catálogo, e non só no ficheiro da galería, para que a ficha poida
   * avisar sen agardar a que ninguén prema o botón.
   */
  plumaxes: Plumaxe[]
  fenoloxia: Fenoloxia | null
  /** Nº de ocorrencias rexistradas en GBIF para Galicia. Serve de proxy de abundancia. */
  citas: number
  /**
   * Índices no catálogo de especies coas que se pode confundir: mesma familia
   * e tamaño semellante. Non inclúe parecido de cor, que non temos.
   */
  parecidas: number[]
  /** Menos de 10 citas: divagante, escapada de catividade ou erro de identificación. */
  rara: boolean
  gbifKey: number
}

/** Lonxitude e latitude, nesa orde, como en GeoJSON. */
export type Punto = [number, number]

/**
 * Unha comarca. As comarcas non teñen competencias propias, pero son a escala
 * á que a xente localiza o que ve: "vin un miñato en Bergantiños".
 */
export interface Zona {
  id: string
  nome: string
  provincia: string | null
  /**
   * Aneis pechados: o primeiro é o continental e os demais son illas. Son os
   * mesmos puntos, xa simplificados, cos que se lle preguntou a GBIF que aves
   * hai aquí; por iso a zona na que te sitúa a app é exactamente aquela da que
   * se contaron as especies.
   */
  aneis: Punto[][]
  centro: Punto
  citas: number
  /** Índices no catálogo de especies, de máis a menos citada. */
  especies: number[]
  /** Citas de cada especie, na mesma orde que `especies`. */
  citasEspecie: number[]
  /** Os mellores lugares de observación de eBird nesta comarca. */
  lugares: Lugar[]
}

/** Un hotspot de eBird: sitio público con reconto histórico de especies. */
export interface Lugar {
  nome: string
  lon: number
  lat: number
  /** Especies rexistradas alí desde sempre. */
  especies: number
}

export interface Zonas {
  version: number
  fontes: string[]
  aviso: string
  total: number
  zonas: Zona[]
}

/** Cando se descargaron os datos, para poder datar o que se amosa. */
export interface Rexistro {
  /** AAAA-MM-DD da última execución de `etl/todo.py`. */
  data?: string
  /** false se se executaron só algunhas fontes: hai datos de distintas datas. */
  completa?: boolean
  /** Data de cada fonte por separado. */
  fontes?: Record<string, string>
}

export interface Catalogo {
  version: number
  fontes: string[]
  rexistro: Rexistro
  avisoFenoloxia: string
  total: number
  especies: Especie[]
}
