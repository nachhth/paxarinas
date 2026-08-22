/**
 * A query coa que se entrou no sitio, gardada antes de que ninguén a toque.
 *
 * Mentres Nuxt hidrata unha páxina xerada de antemán, normaliza a ruta e deixa
 * a URL un intre SEN a query. Medido sobre o sitio construído, entrando en
 * «/?busca=merlo&raras=1», a orde é esta:
 *
 *     replaceState → /?busca=merlo&raras=1
 *     replaceState → /                       ← desaparece a query
 *     … aquí avalíanse as páxinas e corre `onMounted` …
 *     replaceState → /?busca=merlo&raras=1    ← e volve
 *
 * Así que nin `route.query`, nin `location.search`, nin agardar por
 * `router.isReady()` dentro dunha páxina serven: todo iso cae no medio, onde
 * non hai nada que ler, e unha ligazón con filtros abríase sen eles. Este
 * módulo avalíase co paquete de entrada, antes de que exista o encamiñador, e
 * por iso chega a tempo.
 */
let daEntrada = window.location.search

/**
 * A query que lle toca a quen pregunta.
 *
 * Se a URL de agora xa ten unha, é esa: son as navegacións de dentro da app
 * —volver atrás desde unha ficha, por exemplo—, onde o encamiñador xa fixo o
 * seu traballo. Só cando non hai nada que ler se bota man da de entrada, e
 * unha soa vez: se non, o día que alguén baleire os filtros e volva atrás,
 * reaparecerían os da ligazón coa que abriu o sitio hai media hora.
 */
function consultaInicial(): string {
  const agora = window.location.search
  const escollida = agora || daEntrada
  daEntrada = ''
  return escollida
}

export default defineNuxtPlugin(() => ({ provide: { consultaInicial } }))
