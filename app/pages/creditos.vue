<script setup lang="ts">
const catalogo = useCatalogo()

useHead({ title: 'Créditos — Paxariñas' })

const conFoto = computed(() =>
  catalogo.especies
    .filter(e => e.foto)
    .sort((a, b) => a.cientifico.localeCompare(b.cientifico)))

/** Cantas fotos hai de cada licenza, para dar conta do conxunto. */
const porLicenza = computed(() => {
  const conta = new Map<string, number>()
  for (const e of conFoto.value) {
    const l = e.foto!.licenza
    conta.set(l, (conta.get(l) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
})
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">← Todas as aves</NuxtLink>
    <h1>Créditos e licenzas</h1>

    <section class="bloque">
      <h2>Datos</h2>
      <p>
        A listaxe de especies, a taxonomía e o número de citas proveñen de
        <a href="https://www.gbif.org">GBIF</a>. Os nomes vernáculos galegos
        proveñen de Catalogue of Life a través de GBIF.
      </p>
    </section>

    <section class="bloque">
      <h2>Fotografías</h2>
      <p>
        {{ conFoto.length }} fotografías de
        <a href="https://commons.wikimedia.org">Wikimedia Commons</a>,
        localizadas a través de Wikidata. Cada unha conserva a súa autoría e a
        súa licenza, que se indican tamén na ficha da especie.
      </p>
      <ul class="resumo">
        <li v-for="[licenza, n] in porLicenza" :key="licenza">
          {{ licenza }}: {{ n }}
        </li>
      </ul>
    </section>

    <table class="taboa">
      <thead>
        <tr>
          <th>Especie</th>
          <th>Autoría</th>
          <th>Licenza</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in conFoto" :key="e.slug">
          <td>
            <NuxtLink :to="`/especie/${e.slug}`">{{ e.cientifico }}</NuxtLink>
          </td>
          <td>{{ e.foto!.autor ?? 'Autoría non indicada' }}</td>
          <td>
            <a v-if="e.foto!.licenzaUrl" :href="e.foto!.licenzaUrl" rel="license">
              {{ e.foto!.licenza }}
            </a>
            <span v-else>{{ e.foto!.licenza }}</span>
            <template v-if="e.foto!.orixe">
              · <a :href="e.foto!.orixe">orixe</a>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.volver {
  font-size: 0.9rem;
  text-decoration: none;
}

.bloque {
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}

.bloque h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tinta-suave);
}

.bloque p {
  margin: 0 0 0.5rem;
}

.resumo {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.9rem;
  color: var(--tinta-suave);
}

/* A táboa é ancha; que rompa a páxina en móbil sería peor que un scroll seu. */
.taboa {
  display: block;
  overflow-x: auto;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.taboa th,
.taboa td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--borde);
  vertical-align: top;
}

.taboa th {
  position: sticky;
  top: 0;
  background: var(--bretema);
}
</style>
