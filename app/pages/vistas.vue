<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const catalogo = useCatalogo()
const { vistas, baleira } = useVistas()

useHead({ title: 'As miñas aves — Paxariñas' })

const porSlug = new Map(catalogo.especies.map(e => [e.slug, e]))

/** Da máis recente á máis antiga: o que acabas de ver é o que queres revisar. */
const listaxe = computed(() =>
  [...vistas.value]
    .sort((a, b) => b.data.localeCompare(a.data))
    .map(v => ({ vista: v, especie: porSlug.get(v.slug) }))
    .filter((x): x is { vista: typeof x.vista; especie: Especie } => !!x.especie))

const familias = computed(() =>
  new Set(listaxe.value.map(x => x.especie.familia).filter(Boolean)).size)

const confirmando = ref(false)

function descarga() {
  const csv = csvDeVistas(vistas.value, (slug) => {
    const e = porSlug.get(slug)
    if (!e) return null
    return { gl: e.nomes.gl ?? e.cientifico, cientifico: e.cientifico }
  })

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'as-minas-aves.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>
    <h1>As miñas aves</h1>

    <ClientOnly>
      <template v-if="listaxe.length">
        <p class="resumo">
          <strong>{{ listaxe.length }}</strong>
          {{ listaxe.length === 1 ? 'especie' : 'especies' }}
          de {{ familias }} {{ familias === 1 ? 'familia' : 'familias' }}.
        </p>

        <ul class="aves">
          <li v-for="{ vista, especie } in listaxe" :key="vista.slug">
            <NuxtLink :to="`/especie/${especie.slug}`" class="ave">
              <img
                v-if="especie.foto" :src="especie.foto.mini"
                :alt="nomeMostrado(especie)" class="ave__foto"
                width="56" height="56" loading="lazy" decoding="async"
              >
              <span v-else class="ave__foto ave__foto--baleira" aria-hidden="true">🪶</span>
              <span class="ave__nomes">
                <span class="ave__nome">{{ nomeMostrado(especie) }}</span>
                <span class="ave__sci">{{ especie.cientifico }}</span>
              </span>
              <span class="ave__data">{{ vista.data }}</span>
            </NuxtLink>
          </li>
        </ul>

        <div class="accions">
          <button class="boton boton--suave" @click="descarga">
            Descargar en CSV
          </button>
          <button
            v-if="!confirmando" class="ligazon"
            @click="confirmando = true"
          >
            Baleirar a listaxe
          </button>
          <span v-else class="confirmar">
            Seguro? Non se pode desfacer.
            <button class="ligazon" @click="baleira(); confirmando = false">
              Si, baleirar
            </button>
            <button class="ligazon" @click="confirmando = false">Cancelar</button>
          </span>
        </div>

        <p class="nota">
          A listaxe gárdase só neste dispositivo: non hai contas nin sae de aquí.
          Por iso tamén se perde se borras os datos do navegador — o CSV é o
          xeito de conservala.
        </p>
      </template>

      <p v-else class="baleiro">
        Aínda non marcaches ningunha ave.
        <span class="baleiro__pista">
          En cada ficha hai un botón para marcala como vista. Gárdase neste
          dispositivo, sen contas nin rexistro.
        </span>
      </p>

      <template #fallback>
        <p class="baleiro">Cargando a túa listaxe…</p>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.resumo {
  margin: 0 0 1rem;
  color: var(--tinta-suave);
}

.aves {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

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
  width: 3rem;
  height: 3rem;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bretema);
  flex: none;
}

.ave__foto--baleira {
  display: grid;
  place-items: center;
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
  font-size: 0.78rem;
  font-style: italic;
  color: var(--tinta-suave);
}

.ave__data {
  font-size: 0.78rem;
  color: var(--tinta-suave);
  font-variant-numeric: tabular-nums;
  flex: none;
}

.accions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.1rem;
  margin-bottom: 0.75rem;
}

.ligazon {
  font: inherit;
  font-size: 0.85rem;
  color: var(--fento);
  background: none;
  border: none;
  padding: 0;
  min-height: 2.75rem;
  text-decoration: underline;
  cursor: pointer;
}

.confirmar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}
</style>
