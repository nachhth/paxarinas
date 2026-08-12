<script setup lang="ts">
const catalogo = useCatalogo()
const { zonas, aviso } = useZonas()

const escollida = ref<string | null>(null)
const incluirRaras = ref(false)
const soDeste = ref(false)

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
        {{ zona.nome }}: {{ resultados.length }}
        {{ resultados.length === 1 ? 'especie' : 'especies' }}
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
      </p>
    </section>
  </div>
</template>

<style scoped>
.título {
  margin-top: 0;
  font-size: 1.4rem;
}

.intro {
  color: var(--tinta-suave);
  margin-top: 0;
}

.aviso {
  margin: 0.75rem 0 1.5rem;
  font-size: 0.8rem;
  color: var(--tinta-suave);
}

.listado__título {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

/* Pregado por defecto: o que se busca aquí son as aves, non os sitios. */
.lugares {
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.lugares summary {
  cursor: pointer;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  color: var(--fento);
}

.lugares__lista {
  margin: 0;
  padding-left: 1.1rem;
}

.lugares__lista li {
  margin-bottom: 0.2rem;
}

.lugares__conta {
  color: var(--tinta-suave);
  font-size: 0.8rem;
  margin-left: 0.35rem;
}

.lugares__fonte {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  color: var(--tinta-suave);
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

/* 44 px de alto mínimo, coma no resto da app: por debaixo diso falla ao dedo. */
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
}

.baleiro {
  color: var(--tinta-suave);
}
</style>
