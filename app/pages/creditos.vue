<script setup lang="ts">
const catalogo = useCatalogo()

useHead({ title: 'Créditos — Paxariñas' })

const conFoto = computed(() =>
  catalogo.especies
    .filter(e => e.foto)
    .sort((a, b) => a.cientifico.localeCompare(b.cientifico)))

/** Todas as gravacións, non unha por especie: cada unha ten a súa autoría. */
const gravacions = computed(() => catalogo.especies.flatMap(e => e.cantos))

/** De que país procede cada gravación: as voces varían entre subespecies. */
const porPais = computed(() => {
  const conta = new Map<string, number>()
  for (const c of gravacions.value) {
    const p = c.pais ?? 'sen indicar'
    conta.set(p, (conta.get(p) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
})

/** De onde saen os nomes galegos, para que se poida auditar. */
const porFonteNome = computed(() => {
  const conta = new Map<string, number>()
  for (const e of catalogo.especies) {
    const f = e.nomes.glFonte ?? 'Sen nome galego aínda'
    conta.set(f, (conta.get(f) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
})

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
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>
    <h1>Créditos e licenzas</h1>

    <section class="bloque">
      <h2>Datos</h2>
      <p>
        A listaxe de especies, a taxonomía e o número de citas proveñen de
        <a href="https://www.gbif.org">GBIF</a>. Os nomes galegos veñen de
        Catalogue of Life a través de GBIF e, para as especies que alí non o
        teñen, de <a href="https://www.wikidata.org">Wikidata</a>. Cada ficha
        indica de onde sae o seu.
      </p>
      <ul class="resumo">
        <li v-for="[fonte, n] in porFonteNome" :key="fonte">
          <span>{{ fonte }}</span><b>{{ n }}</b>
        </li>
      </ul>
    </section>

    <section class="bloque">
      <h2>Tamaño e hábitat</h2>
      <p>
        Os datos de peso, medidas, hábitat e dieta que permiten identificar unha
        ave sen saber o seu nome proveñen de
        <a href="https://doi.org/10.1111/ele.13898">AVONET</a> (Tobias et al.,
        <em>Ecology Letters</em>, 2022), distribuído baixo
        <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>.
        Cobre 513 das nosas especies.
      </p>
      <p>
        As comparacións de tamaño («coma un pardal») e os grupos por silueta
        son elaboración propia a partir deses datos e da taxonomía de GBIF.
        <strong>Non hai datos de cor</strong>: non existe ningunha fonte aberta
        que os recolla, e nunha ferramenta de identificación unha cor inventada
        sería peor que ningunha.
      </p>
    </section>

    <section class="bloque">
      <h2>Comarcas e mapa</h2>
      <p>
        As fronteiras das comarcas proceden de
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>,
        e distribúense baixo a
        <a href="https://opendatacommons.org/licenses/odbl/" rel="license">ODbL</a>.
        Están simplificadas para que caiban no dispositivo: as lindes que
        amosa o mapa desvíanse ata uns centos de metros das reais.
      </p>
      <p>
        As especies de cada comarca contáronse pedíndolle a GBIF as citas que
        caen dentro dese mesmo polígono simplificado. O mapa non usa teselas
        nin fai ningunha petición: debúxase enteiro no dispositivo, para que
        funcione sen cobertura.
      </p>
    </section>

    <section class="bloque">
      <h2>Lugares de observación</h2>
      <p>
        Os lugares que amosa cada comarca proveñen dos hotspots de
        <a href="https://ebird.org">eBird</a>, do Cornell Lab of Ornithology.
        Son sitios públicos co número de especies rexistradas neles desde
        sempre. Non se emprega ningún dato de observadores nin ningunha
        observación individual.
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
          <span>{{ licenza }}</span><b>{{ n }}</b>
        </li>
      </ul>
      <p class="engadido">
        Ademais, cada ficha ten unha galería con máis fotos que
        <strong>non se descargan</strong>: quedan aloxadas en Commons e só se
        ven con conexión. Cárganse ao premer, non soas, e cada unha amosa a súa
        autoría e licenza.
      </p>
    </section>

    <section v-if="gravacions.length" class="bloque">
      <h2>Gravacións</h2>
      <p>
        {{ gravacions.length }} gravacións de
        <a href="https://xeno-canto.org">xeno-canto</a>, recortadas a 15
        segundos e recodificadas. Por iso só se empregan gravacións cuxa
        licenza permite obras derivadas. Prioritízanse as gravadas en Galicia
        e arredores, porque hai subespecies con voces distintas.
      </p>
      <ul class="resumo">
        <li v-for="[pais, n] in porPais" :key="pais">
          <span>{{ pais }}</span><b>{{ n }}</b>
        </li>
      </ul>
    </section>

    <section class="bloque">
      <h2>Identificación polo son</h2>
      <p>
        A identificación de cantos faina <strong>BirdNET</strong> GLOBAL 6K
        v2.4, de Stefan Kahl, Connor M. Wood, Maximilian Eibl e Holger Klinck,
        do <a href="https://birdnet.cornell.edu/">K. Lisa Yang Center for
        Conservation Bioacoustics</a> (Cornell Lab of Ornithology). O modelo
        está baixo licenza
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>,
        que só permite usos <strong>sen ánimo de lucro</strong>: por iso esta
        app nin ten publicidade nin a vai ter.
      </p>
      <p class="engadido">
        Emprégase a conversión oficial a TensorFlow.js que publica
        <a href="https://github.com/birdnet-team/BirdNET-Analyzer">BirdNET-Analyzer</a>
        (código MIT), modificada para que reciba o espectrograma xa calculado;
        o cálculo do mel-espectrograma escribiuse neste proxecto. O modelo
        <strong>non se descarga ao instalar a app</strong>: son 51 MB e só
        baixan se pides a identificación por son. Todo se executa no
        dispositivo, co
        <a href="https://tensorflow.org/js">TensorFlow.js</a> (Apache-2.0). O
        son gravado non sae do teléfono.
      </p>
    </section>

    <section class="bloque">
      <h2>Foto a foto</h2>
      <p class="fonte">
        As {{ conFoto.length }} fotografías do catálogo, coa súa autoría e a súa
        licenza. Ordenadas polo nome científico.
      </p>
      <div class="taboa-scroll">
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
              <!-- `ligazon` coma no resto da app: as dúas URL veñen de
                   `extmetadata` de Commons, que edita calquera. Se non son
                   http(s) queda o nome da licenza en texto —que é o que esixe a
                   atribución— pero sen enlace. -->
              <td>
                <a v-if="ligazon(e.foto!.licenzaUrl)" :href="ligazon(e.foto!.licenzaUrl)!" rel="license">
                  {{ e.foto!.licenza }}
                </a>
                <span v-else>{{ e.foto!.licenza }}</span>
                <template v-if="ligazon(e.foto!.orixe)">
                  · <a :href="ligazon(e.foto!.orixe)!">orixe</a>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* `.volver` e `.bloque` veñen de base.css. */

.bloque p {
  max-width: 46rem;
  text-wrap: pretty;
}

/* Reconto por fonte, licenza ou país. Eran viñetas soltas; agora son pares
   dato-cifra aliñados, que é o que se vén mirar aquí. */
.resumo {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 1px;
  font-size: 0.88rem;
  border-radius: var(--raio);
  overflow: hidden;
  background: var(--borde);
}

.resumo li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0.6rem;
  background: var(--papel);
  color: var(--tinta-suave);
}

.resumo b {
  color: var(--tinta);
  font-variant-numeric: tabular-nums;
}

.engadido {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--borde);
  font-size: 0.9rem;
  color: var(--tinta-suave);
}

/* O scroll vai nun contedor propio e non na táboa: `display: block` sobre unha
   táboa rompe o seu modelo de caixa e desaliña as columnas. */
.taboa-scroll {
  overflow-x: auto;
  width: 100%;
  -webkit-overflow-scrolling: touch;
}

.taboa {
  width: 100%;
  min-width: 30rem;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.taboa th,
.taboa td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--borde);
  vertical-align: top;
}

/* Cabeceira fixa ao subir a táboa. O fondo ten que ser opaco e do mesmo ton
   que o bloque, se non vense pasar as filas por debaixo. */
.taboa th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--papel);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--tinta-suave);
  box-shadow: inset 0 -1px 0 var(--borde);
}

/* Bandeado moi suave: 500 filas seguidas sen guía perdían a liña. */
.taboa tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--tinta) 3%, transparent);
}

.taboa tbody tr:hover {
  background: var(--fento-tenue);
}

.taboa td:first-child {
  font-style: italic;
  white-space: nowrap;
}
</style>
