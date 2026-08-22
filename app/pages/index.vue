<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const catalogo = useCatalogo()
const router = useRouter()

const MESES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro']

/**
 * Os filtros viven na URL, non só en refs locais.
 *
 * Ao entrar nunha ficha este compoñente destrúese, e ao volver atrás recréase.
 * Se o estado vivise só aquí volvería cos valores por defecto, así que a lista
 * que se pinta sería outra —as 393 enteiras— e a posición do scroll que o
 * router restaura, medida sobre a lista filtrada, caería nun sitio que xa non
 * ten nada que ver: co filtro posto o desprazamento é de poucos centos de
 * píxeles e sobre a lista completa iso é practicamente o principio. Levándoos á
 * query reconstrúese exactamente a mesma lista antes de restaurar o scroll.
 *
 * De propina, unha busca queda enlazable e compartible.
 */
/**
 * A consulta da URL de entrada vén do plugin `consulta-inicial`, non de
 * `route.query` nin de `location`: cando esta páxina monta, a URL está un
 * intre sen a query. A explicación enteira, alí.
 */
function parametro(consulta: string, nome: string): string {
  return new URLSearchParams(consulta).get(nome) ?? ''
}

/** Só se acepta un índice de mes real; calquera outra cousa é «todo o ano». */
function mesDaQuery(consulta: string): string {
  const v = parametro(consulta, 'mes')
  return /^(?:[0-9]|1[01])$/.test(v) ? v : ''
}

/**
 * Baleiros ata montar. A páxina está prerenderizada, e mentres o navegador a
 * hidrata `useRoute()` aínda devolve a ruta sen query: lendo aquí, unha URL
 * con busca ou filtros —a que un garda nos marcadores— abría a listaxe enteira
 * e sen nada posto, e o vixiante remataba de limpar a URL.
 */
const busca = ref('')
const ordeEscollida = ref('')
const incluirRaras = ref(false)
/** '' = todo o ano; se non, índice 0-11 do mes escollido. */
const mesEscollido = ref<string>('')

onMounted(() => {
  const consulta = useNuxtApp().$consultaInicial()
  busca.value = parametro(consulta, 'busca')
  ordeEscollida.value = parametro(consulta, 'orde')
  incluirRaras.value = parametro(consulta, 'raras') === '1'
  mesEscollido.value = mesDaQuery(consulta)
})

/** A query queda co mínimo: un filtro sen poñer non aparece na URL. */
function aplicaNaUrl() {
  const query: Record<string, string> = {}
  if (busca.value) query.busca = busca.value
  if (mesEscollido.value !== '') query.mes = mesEscollido.value
  if (ordeEscollida.value) query.orde = ordeEscollida.value
  if (incluirRaras.value) query.raras = '1'

  // `replace` e non `push`: cada tecleo non pode ser un paso atrás. Como só
  // cambia a query e non a ruta, o scrollBehavior de Nuxt non move a páxina.
  router.replace({ query })
}

// Os selectores e a caixa de verificación cambian dun golpe, así que van
// directos. A busca vai con atraso: `replaceState` está limitado por número de
// chamadas nos navegadores e ao pasarse Safari lanza, o que faría que
// vue-router caese ao seu recambio, que é recargar a páxina enteira.
watch([mesEscollido, ordeEscollida, incluirRaras], aplicaNaUrl)

let atraso: ReturnType<typeof setTimeout> | undefined
watch(busca, () => {
  clearTimeout(atraso)
  atraso = setTimeout(aplicaNaUrl, 300)
})
onBeforeUnmount(() => clearTimeout(atraso))

const ordes = computed(() => {
  const conta = new Map<string, number>()
  for (const e of catalogo.especies) {
    if (e.orde) conta.set(e.orde, (conta.get(e.orde) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
})

/**
 * A busca vai contra todos os nomes, non só o galego: moita xente coñece o
 * paxaro en castelán ou en inglés e chega buscando por aí. Tamén contra a
 * familia e a orde, que serven para atopar grupos enteiros.
 */
function textoBuscable(e: Especie) {
  return normaliza([
    e.cientifico, e.nomes.gl, e.nomes.es, e.nomes.en, e.nomes.pt,
    e.familia, e.orde,
  ].filter(Boolean).join(' '))
}

/** Hai algo posto? Serve para o rótulo da listaxe, que non pode mentir. */
const haiFiltro = computed(() =>
  !!busca.value.trim() || mesEscollido.value !== '' || !!ordeEscollida.value)

const resultados = computed(() => {
  const termo = normaliza(busca.value.trim())
  const filtradas = catalogo.especies.filter((e) => {
    if (e.rara && !incluirRaras.value) return false
    if (ordeEscollida.value && e.orde !== ordeEscollida.value) return false
    // `false`: aquí o filtro está para acurtar 517 fichas, así que as especies
    // sen fenoloxía fiable quedan fóra. Ver `veseNoMes`.
    if (mesEscollido.value !== '' && !veseNoMes(e, Number(mesEscollido.value), false)) return false
    if (termo && !textoBuscable(e).includes(termo)) return false
    return true
  })

  // Por número de citas e non por orde alfabética. Quen abre a app viu un
  // paxaro, e case sempre é un dos comúns: poñer o merlo antes ca unha
  // divagante con tres citas é a resposta probable, non un capricho. É o mesmo
  // criterio que xa segue a identificación guiada.
  //
  // Ordénase unha copia: `catalogo.especies` é o catálogo compartido de toda a
  // app e un `sort` in situ reordenaríallelo tamén ao mapa e ás parecidas.
  return [...filtradas].sort((a, b) => (b.citas ?? 0) - (a.citas ?? 0))
})
</script>

<template>
  <div>
    <div class="filtros">
      <input
        v-model="busca"
        type="search"
        class="busca"
        placeholder="Buscar unha ave…"
        aria-label="Buscar especie por nome en calquera idioma, familia ou orde"
      >
    </div>

    <!-- Os tres filtros secundarios, pregados. Seguen todos aí: o que cambia é
         que non ocupan media pantalla antes de ver a primeira ave. Ábrense sos
         se se chega cun filtro posto na URL, que se non parecería que se
         perdeu. -->
    <details class="mais-filtros" :open="mesEscollido !== '' || !!ordeEscollida || incluirRaras">
      <summary>Máis filtros</summary>
      <div class="filtros">
        <select v-model="mesEscollido" class="selector" aria-label="Filtrar por mes">
        <option value="">Todo o ano</option>
        <option v-for="(nome, i) in MESES" :key="nome" :value="String(i)">
          Vense en {{ nome }}
        </option>
      </select>

      <select v-model="ordeEscollida" class="selector" aria-label="Filtrar por orde">
        <option value="">Todas as ordes</option>
        <option v-for="[orde, n] in ordes" :key="orde" :value="orde">
          {{ orde }} ({{ n }})
        </option>
      </select>

        <label class="check">
          <input v-model="incluirRaras" type="checkbox">
          Incluír raras e divagantes
        </label>
      </div>
    </details>

    <!-- Rótulo da listaxe: di que orde leva, que sen dicilo parece arbitraria. -->
    <p class="conta">
      <span class="conta__que">{{ haiFiltro ? 'Resultados' : 'As máis citadas' }}</span>
      <span class="conta__n">{{ resultados.length }}</span>
    </p>

    <ul class="listaxe">
      <li v-for="e in resultados" :key="e.slug">
        <NuxtLink :to="`/especie/${e.slug}`" class="tarxeta">
          <img
            v-if="e.foto"
            :src="e.foto.mini"
            :alt="`${nomeMostrado(e)} (${e.cientifico})`"
            class="tarxeta__foto"
            :style="{ objectPosition: encadre(e.foto) }"
            width="250"
            height="180"
            loading="lazy"
            decoding="async"
          >
          <span v-else class="tarxeta__foto tarxeta__foto--baleira" aria-hidden="true">
            <IconaPluma />
          </span>

          <span class="tarxeta__nome">{{ nomeMostrado(e) }}</span>
          <span class="tarxeta__sci">{{ e.cientifico }}</span>
          <span class="tarxeta__meta">
            {{ e.familia }}
            <span v-if="e.fenoloxia?.fiable" class="etiqueta etiqueta--fen">
              {{ e.fenoloxia.estatus }}
            </span>
            <span v-if="e.rara" class="etiqueta">rara</span>
          </span>
        </NuxtLink>
      </li>
    </ul>

    <p v-if="!resultados.length" class="baleiro">
      Non hai ningunha especie que cadre con esa busca.
    </p>
  </div>
</template>

<style scoped>

/* Os filtros secundarios, pregados. */
.mais-filtros {
  margin-bottom: 0.9rem;
}

.mais-filtros summary {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--fento);
  cursor: pointer;
}

.mais-filtros[open] summary {
  margin-bottom: 0.4rem;
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
}

.busca {
  flex: 1 1 16rem;
}

/* 44px de alto mínimo: por debaixo diso os controis fallan ao dedo.
   `font: inherit` mantén os 16px que evitan o zoom automático de iOS. */
.busca,
.selector {
  min-height: 2.75rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  color: inherit;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
}

.check {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--tinta-suave);
  cursor: pointer;
}

.check input {
  width: 1.15rem;
  height: 1.15rem;
}

/* Rótulo da listaxe. O número vai nunha pílula á dereita: o que interesa é
   «de que vai esta lista», e a cifra é o dato secundario. */
.conta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.conta__que {
  font-family: var(--fonte-titulo);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--tinta);
}

.conta__n {
  flex: none;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--fento-tenue);
  color: var(--fento);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.listaxe {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
  /* Dúas columnas desde o móbil: a foto é o que identifica un paxaro, e a unha
     columna só caben dúas tarxetas por pantalla. `minmax(0,1fr)` e non `1fr`
     porque as fotos teñen ancho intrínseco e desbordarían a columna. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 34rem) {
  .listaxe {
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  }
}

.tarxeta {
  display: block;
  padding: 0 0 0.7rem;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  box-shadow: var(--sombra);
  text-decoration: none;
  color: inherit;
  height: 100%;
  overflow: hidden;
}

.tarxeta__nome,
.tarxeta__sci,
.tarxeta__meta {
  padding-inline: 0.85rem;
}

/* Alto fixo e aspect-ratio para que a grella non salte mentres cargan as
   imaxes en diferido. */
.tarxeta__foto {
  display: block;
  width: 100%;
  aspect-ratio: 25 / 18;
  object-fit: cover;
  background: var(--bretema);
  margin-bottom: 0.6rem;
}

.tarxeta__foto--baleira {
  display: grid;
  place-items: center;
  /* `IconaPluma` mide 1em, así que o tamaño decídese aquí. Xa non se lle pasa
     `color`: a pluma leva os seus tres tons. */
  font-size: 2.6rem;
  opacity: 0.85;
}

.tarxeta:hover {
  border-color: var(--fento-claro);
}

.tarxeta__nome {
  display: block;
  font-family: var(--fonte-titulo);
  font-size: 1.06rem;
  font-weight: 600;
  line-height: 1.25;
}

/* O binomio en cursiva serif. É a convención de todas as guías de campo, e é o
   que fai que unha lista de nomes científicos se lea como unha guía e non como
   unha táboa de base de datos. */
.tarxeta__sci {
  display: block;
  font-family: var(--fonte-titulo);
  font-style: italic;
  font-size: 0.9rem;
  color: var(--tinta-suave);
}

.tarxeta__meta {
  display: block;
  font-size: 0.78rem;
  color: var(--granito);
  margin-top: 0.25rem;
}

.etiqueta {
  display: inline-block;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--papo);
  color: var(--etiqueta-tinta);
  font-size: 0.7rem;
  font-weight: 600;
}

.etiqueta--fen {
  background: color-mix(in srgb, var(--fento) 15%, transparent);
  color: var(--fento);
  text-transform: capitalize;
}

.baleiro {
  color: var(--tinta-suave);
}
</style>
