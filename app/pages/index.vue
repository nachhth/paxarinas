<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const catalogo = useCatalogo()
const route = useRoute()
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
function parametro(nome: string): string {
  const v = route.query[nome]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

/** Só se acepta un índice de mes real; calquera outra cousa é «todo o ano». */
function mesDaQuery(): string {
  const v = parametro('mes')
  return /^(?:[0-9]|1[01])$/.test(v) ? v : ''
}

const busca = ref(parametro('busca'))
const ordeEscollida = ref(parametro('orde'))
const incluirRaras = ref(parametro('raras') === '1')
/** '' = todo o ano; se non, índice 0-11 do mes escollido. */
const mesEscollido = ref<string>(mesDaQuery())

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

const resultados = computed(() => {
  const termo = normaliza(busca.value.trim())
  return catalogo.especies.filter((e) => {
    if (e.rara && !incluirRaras.value) return false
    if (ordeEscollida.value && e.orde !== ordeEscollida.value) return false
    // `false`: aquí o filtro está para acurtar 517 fichas, así que as especies
    // sen fenoloxía fiable quedan fóra. Ver `veseNoMes`.
    if (mesEscollido.value !== '' && !veseNoMes(e, Number(mesEscollido.value), false)) return false
    if (termo && !textoBuscable(e).includes(termo)) return false
    return true
  })
})
</script>

<template>
  <div>
    <p class="intro">
      <strong>{{ catalogo.total }}</strong> especies de aves con citas
      rexistradas en Galicia.
    </p>

    <!-- Buscar polo nome só serve a quen xa o sabe. Quen ve un paxaro e non o
         coñece precisa a outra porta, e ten que atopala antes que os filtros. -->
    <NuxtLink to="/identificar" class="chamada">
      <!-- SVG e non un emoji: 🔎 debúxao cada sistema operativo á súa maneira e
           chegaba con cores propias que non son as da app. -->
      <svg class="chamada__icona" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" />
      </svg>
      <span>
        <strong>Non sabes que paxaro é?</strong>
        <span class="chamada__pe">Chega a el polo tamaño, o sitio e a época.</span>
      </span>
    </NuxtLink>

    <p class="chamada__son">
      Ou, se o oes cantar, <NuxtLink to="/escoitar">identifícao polo son</NuxtLink>.
    </p>

    <div class="filtros">
      <input
        v-model="busca"
        type="search"
        class="busca"
        placeholder="Buscar en galego, castelán, inglés ou latín…"
        aria-label="Buscar especie por nome en calquera idioma, familia ou orde"
      >

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

    <p class="conta">{{ resultados.length }} especies</p>

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
.intro {
  margin-top: 0;
  color: var(--tinta-suave);
}

.chamada {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
  background: var(--papel);
  border: 1px solid var(--fento-claro);
  border-left: 4px solid var(--fento);
  border-radius: var(--raio);
  text-decoration: none;
  color: inherit;
}

.chamada__icona {
  width: 1.6rem;
  height: 1.6rem;
  flex: none;
  fill: none;
  stroke: var(--fento);
  stroke-width: 2;
  stroke-linecap: round;
}

.chamada__pe {
  display: block;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.chamada__son {
  margin: -0.6rem 0 1rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
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

.conta {
  font-size: 0.85rem;
  color: var(--tinta-suave);
  margin: 0 0 0.6rem;
}

.listaxe {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
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
