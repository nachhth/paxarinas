<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const route = useRoute()
const catalogo = useCatalogo()

const especie = computed<Especie | undefined>(() =>
  catalogo.especies.find(e => e.slug === route.params.slug))

if (!especie.value) {
  throw createError({ statusCode: 404, statusMessage: 'Especie non atopada', fatal: true })
}

const titulo = computed(() => nomeMostrado(especie.value!))

useHead(() => ({ title: `${titulo.value} — Paxariñas` }))

const outrosNomes = computed(() => {
  const e = especie.value
  if (!e) return []
  return [
    { idioma: 'Castelán', nome: e.nomes.es },
    { idioma: 'Inglés', nome: e.nomes.en },
    { idioma: 'Portugués', nome: e.nomes.pt },
  ].filter(n => n.nome)
})
</script>

<template>
  <article v-if="especie">
    <NuxtLink to="/" class="volver">← Todas as aves</NuxtLink>

    <h1 class="titulo">{{ titulo }}</h1>
    <p class="cientifico">
      <em>{{ especie.cientifico }}</em>
      <span v-if="especie.autoria" class="autoria"> {{ especie.autoria }}</span>
    </p>

    <figure v-if="especie.foto" class="foto">
      <img
        :src="especie.foto.grande"
        :alt="`${titulo} (${especie.cientifico})`"
        width="500"
        height="360"
        decoding="async"
      >
      <figcaption>
        <span v-if="especie.foto.autor">{{ especie.foto.autor }} · </span>
        <a v-if="especie.foto.licenzaUrl" :href="especie.foto.licenzaUrl" rel="license">
          {{ especie.foto.licenza }}
        </a>
        <span v-else>{{ especie.foto.licenza }}</span>
        <template v-if="especie.foto.orixe">
          · <a :href="especie.foto.orixe">Wikimedia Commons</a>
        </template>
      </figcaption>
    </figure>

    <p v-if="!especie.nomes.gl" class="aviso">
      Esta especie aínda non ten nome galego no catálogo. É un dos ocos que
      queda por encher.
    </p>

    <section class="bloque">
      <h2>Clasificación</h2>
      <dl class="datos">
        <dt>Orde</dt>
        <dd>{{ especie.orde ?? '—' }}</dd>
        <dt>Familia</dt>
        <dd>{{ especie.familia ?? '—' }}</dd>
        <dt>Xénero</dt>
        <dd><em>{{ especie.xenero ?? '—' }}</em></dd>
      </dl>
    </section>

    <section v-if="especie.nomes.gl" class="bloque">
      <h2>Nome galego</h2>
      <p class="nome-gl">{{ especie.nomes.gl }}</p>
      <p class="fonte">Fonte: {{ especie.nomes.glFonte }}</p>
    </section>

    <section v-if="outrosNomes.length" class="bloque">
      <h2>Noutros idiomas</h2>
      <dl class="datos">
        <template v-for="n in outrosNomes" :key="n.idioma">
          <dt>{{ n.idioma }}</dt>
          <dd>{{ n.nome }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="especie.fenoloxia && especie.fenoloxia.total" class="bloque">
      <h2>Cando se ve</h2>
      <p v-if="especie.fenoloxia.fiable" class="estatus">{{ especie.fenoloxia.estatus }}</p>
      <p v-else class="estatus estatus--incerto">
        Poucas citas para dicir en que época aparece.
      </p>

      <BarraMeses :fenoloxia="especie.fenoloxia" />

      <p class="fonte">
        {{ catalogo.avisoFenoloxia }}
      </p>
    </section>

    <section class="bloque">
      <h2>En Galicia</h2>
      <p>
        {{ especie.citas.toLocaleString('gl-ES') }} citas rexistradas en GBIF.
        <template v-if="especie.rara">
          Con tan poucos rexistros, trátase probablemente dunha ave divagante,
          dunha escapada de catividade ou dun erro de identificación.
        </template>
      </p>
      <p class="fonte">
        <a :href="`https://www.gbif.org/species/${especie.gbifKey}`">
          Ver en GBIF
        </a>
      </p>
    </section>
  </article>
</template>

<style scoped>
.volver {
  font-size: 0.9rem;
  text-decoration: none;
}

.titulo {
  margin: 0.5rem 0 0.2rem;
  line-height: 1.2;
}

.cientifico {
  margin: 0 0 1.5rem;
  color: var(--tinta-suave);
}

.autoria {
  font-size: 0.85rem;
}

.foto {
  margin: 0 0 1.25rem;
}

.foto img {
  display: block;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 25 / 18;
  object-fit: cover;
  background: var(--bretema);
  border-radius: var(--raio);
}

.foto figcaption {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: var(--tinta-suave);
}

.aviso {
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--toxo);
  background: var(--papel);
  border-radius: 0 var(--raio) var(--raio) 0;
  font-size: 0.9rem;
}

.bloque {
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
  box-shadow: var(--sombra);
}

.bloque h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tinta-suave);
}

.bloque p {
  margin: 0 0 0.4rem;
}

.datos {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  margin: 0;
}

.datos dt {
  font-weight: 600;
  color: var(--tinta-suave);
}

.datos dd {
  margin: 0;
}

.fonte {
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
  color: var(--tinta-suave);
}

.nome-gl {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0;
}

.estatus {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: capitalize;
  margin: 0 0 0.6rem;
}

.estatus--incerto {
  font-size: 0.95rem;
  font-weight: 400;
  text-transform: none;
  color: var(--tinta-suave);
}
</style>
