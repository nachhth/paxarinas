<script setup lang="ts">
const catalogo = useCatalogo()
const { zonas, aviso } = useZonas()
const route = useRoute()
const router = useRouter()

/**
 * A comarca e os seus filtros van na URL polo mesmo motivo que na portada: ao
 * volver dunha ficha este compoñente recréase, e se o estado vivise só nun ref
 * a comarca quedaría sen escoller, o listado desaparecería enteiro (vai tras un
 * `v-if`) e a páxina encollería ata non chegar á posición que o router intenta
 * restaurar. Medido: de 19 990 px de alto a 1 027, e o scroll de 2 500 px
 * acababa en 183. Aquí é máis grave que na portada, porque alí polo menos
 * quedaba unha lista.
 */
function parametro(nome: string): string {
  const v = route.query[nome]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

const escollida = ref<string | null>(
  zonas.some(z => z.id === parametro('zona')) ? parametro('zona') : null,
)
const incluirRaras = ref(parametro('raras') === '1')
const soDeste = ref(parametro('mes') === '1')

watch([escollida, incluirRaras, soDeste], () => {
  const query: Record<string, string> = {}
  if (escollida.value) query.zona = escollida.value
  if (incluirRaras.value) query.raras = '1'
  if (soDeste.value) query.mes = '1'
  // `replace`: escoller comarca non é un paso de navegación do que volver.
  router.replace({ query })
})

const MESES = [
  'xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro',
]

/**
 * O mes calcúlase no cliente e non ao renderizar: a páxina prerenderízase unha
 * vez ao despregar e quedaría conxelada no mes do despregue.
 */
const mes = ref<number | null>(null)
onMounted(() => {
  mes.value = new Date().getMonth()
})

const zona = computed(() => zonas.find(z => z.id === escollida.value) ?? null)

/** As especies da zona, da máis citada á menos, xa resoltas contra o catálogo. */
const aves = computed(() => {
  if (!zona.value) return []
  return zona.value.especies.map((indice, i) => ({
    especie: catalogo.especies[indice]!,
    citas: zona.value!.citasEspecie[i]!,
  }))
})

const resultados = computed(() => aves.value.filter(({ especie }) => {
  if (especie.rara && !incluirRaras.value) return false
  if (soDeste.value && mes.value !== null) {
    // Mesmo limiar que usa o ETL para dar un mes por presente: por debaixo
    // do 3 % das citas é goteo, non presenza.
    if ((especie.fenoloxia?.meses[mes.value] ?? 0) < 3) return false
  }
  return true
}))

useHead({ title: 'Mapa por comarcas — Paxariñas' })
</script>

<template>
  <div>
    <h1 class="título">As aves da túa zona</h1>
    <p class="intro">
      Escolle unha comarca no mapa, ou deixa que a app te sitúe, para ver que
      aves están citadas alí.
    </p>

    <MapaZonas v-model="escollida" />

    <p class="aviso">{{ aviso }}</p>

    <section v-if="zona" class="listado">
      <h2 class="listado__título">
        {{ zona.nome }}
        <span class="listado__conta">
          {{ resultados.length }}
          {{ resultados.length === 1 ? 'especie' : 'especies' }}
        </span>
      </h2>

      <details v-if="zona.lugares.length" class="lugares">
        <summary>Onde observar ({{ zona.lugares.length }})</summary>
        <ul class="lugares__lista">
          <li v-for="l in zona.lugares" :key="l.nome">
            <a :href="`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=15/${l.lat}/${l.lon}`">
              {{ l.nome }}
            </a>
            <span class="lugares__conta">{{ l.especies }} especies</span>
          </li>
        </ul>
        <p class="lugares__fonte">
          Lugares de observación de eBird, ordenados polas especies rexistradas
          alí desde sempre.
        </p>
      </details>

      <div class="filtros">
        <label class="check">
          <input v-model="incluirRaras" type="checkbox">
          Incluír raras e divagantes
        </label>

        <label v-if="mes !== null" class="check">
          <input v-model="soDeste" type="checkbox">
          Só as que se ven en {{ MESES[mes] }}
        </label>
      </div>

      <ul class="aves">
        <li v-for="{ especie, citas } in resultados" :key="especie.slug">
          <NuxtLink :to="`/especie/${especie.slug}`" class="ave">
            <img
              v-if="especie.foto"
              :src="especie.foto.mini"
              :alt="`${nomeMostrado(especie)} (${especie.cientifico})`"
              class="ave__foto"
              width="56"
              height="56"
              loading="lazy"
              decoding="async"
            >
            <span v-else class="ave__foto ave__foto--baleira" aria-hidden="true">🪶</span>

            <span class="ave__nomes">
              <span class="ave__nome">{{ nomeMostrado(especie) }}</span>
              <span class="ave__sci">{{ especie.cientifico }}</span>
            </span>

            <span class="ave__citas">{{ citas.toLocaleString('gl') }} citas</span>
          </NuxtLink>
        </li>
      </ul>

      <p v-if="!resultados.length" class="baleiro">
        Non hai ningunha especie que cadre con eses filtros nesta comarca.
        <span class="baleiro__pista">
          Proba a incluír as raras ou a quitar o filtro do mes.
        </span>
      </p>
    </section>

    <!-- Antes desta escolla a páxina remataba no mapa e non se sabía se
         faltaba por cargar algo. -->
    <p v-else class="baleiro">
      Aínda non escolliches comarca.
      <span class="baleiro__pista">
        Preme unha no mapa, escóllea na lista ou usa «Onde estou».
      </span>
    </p>
  </div>
</template>

<style scoped>
/* `.check` e `.baleiro` veñen de base.css, coa mesma regra dos 44 px. */

.título {
  margin-top: 0;
}

.intro {
  color: var(--tinta-suave);
  margin: 0 0 1.1rem;
  max-width: 44rem;
  text-wrap: pretty;
}

.aviso {
  margin: 0.75rem 0 1.75rem;
  padding: 0;
  border: 0;
  background: none;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--tinta-suave);
  text-wrap: pretty;
}

.listado {
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--borde);
}

/* Cabeceira do listado: o nome da comarca manda e o reconto vai de acompañante,
   non ao mesmo peso coma antes. */
.listado__título {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.5rem;
  margin: 0 0 0.75rem;
}

.listado__conta {
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--tinta-suave);
  font-variant-numeric: tabular-nums;
}

/* Pregado por defecto: o que se busca aquí son as aves, non os sitios. */
.lugares {
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  background: var(--papel);
}

.lugares summary {
  cursor: pointer;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.8rem;
  border-radius: var(--raio);
  color: var(--fento);
  font-weight: 600;
  list-style: none;
  transition: background var(--saída);
}

.lugares summary::-webkit-details-marker {
  display: none;
}

/* Frecha propia que xira ao abrir: a nativa non se pode estilar en Safari. */
.lugares summary::before {
  content: '▸';
  transition: transform var(--saída);
}

.lugares[open] summary::before {
  transform: rotate(90deg);
}

.lugares summary:hover {
  background: var(--fento-tenue);
}

.lugares__lista {
  margin: 0;
  padding: 0 0.8rem 0 2rem;
}

.lugares__lista li {
  margin-bottom: 0.3rem;
}

.lugares__conta {
  color: var(--tinta-suave);
  font-size: 0.8rem;
  margin-left: 0.35rem;
  font-variant-numeric: tabular-nums;
}

.lugares__fonte {
  margin: 0.6rem 0 0;
  padding: 0.6rem 0.8rem 0;
  border-top: 1px solid var(--borde);
  font-size: 0.78rem;
  color: var(--tinta-suave);
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  margin-bottom: 0.75rem;
}

.aves {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

/* Filas compactas e non a rejilla con foto grande da portada: unha comarca da
   costa pasa das 250 especies e a rejilla obrigaría a un scroll interminable. */
.ave {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.4rem 0.6rem;
  min-height: 3.5rem;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  text-decoration: none;
  color: inherit;
}

.ave:hover {
  border-color: var(--fento-claro);
}

.ave__foto {
  width: 3.5rem;
  height: 3.5rem;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bretema);
  flex: none;
}

.ave__foto--baleira {
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  opacity: 0.35;
}

.ave__nomes {
  flex: 1;
  min-width: 0;
}

.ave__nome {
  display: block;
  font-weight: 600;
}

.ave__sci {
  display: block;
  font-style: italic;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.ave__citas {
  font-size: 0.78rem;
  color: var(--granito);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
