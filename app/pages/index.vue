<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const catalogo = useCatalogo()

const busca = ref('')
const ordeEscollida = ref('')
const incluirRaras = ref(false)

const ordes = computed(() => {
  const conta = new Map<string, number>()
  for (const e of catalogo.especies) {
    if (e.orde) conta.set(e.orde, (conta.get(e.orde) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
})

function textoBuscable(e: Especie) {
  return normaliza([e.cientifico, e.nomes.gl, e.nomes.es, e.nomes.en, e.familia]
    .filter(Boolean).join(' '))
}

const resultados = computed(() => {
  const termo = normaliza(busca.value.trim())
  return catalogo.especies.filter((e) => {
    if (e.rara && !incluirRaras.value) return false
    if (ordeEscollida.value && e.orde !== ordeEscollida.value) return false
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

    <div class="filtros">
      <input
        v-model="busca"
        type="search"
        class="busca"
        placeholder="Buscar por nome ou familia…"
        aria-label="Buscar especie"
      >

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
            width="250"
            height="180"
            loading="lazy"
            decoding="async"
          >
          <span v-else class="tarxeta__foto tarxeta__foto--baleira" aria-hidden="true">🪶</span>

          <span class="tarxeta__nome">{{ nomeMostrado(e) }}</span>
          <span class="tarxeta__sci">{{ e.cientifico }}</span>
          <span class="tarxeta__meta">
            {{ e.familia }}
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
  font-size: 2rem;
  opacity: 0.35;
}

.tarxeta:hover {
  border-color: var(--fento-claro);
}

.tarxeta__nome {
  display: block;
  font-weight: 600;
}

.tarxeta__sci {
  display: block;
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
  background: var(--toxo);
  color: #3a2f00;
  font-size: 0.7rem;
  font-weight: 600;
}

.baleiro {
  color: var(--tinta-suave);
}
</style>
