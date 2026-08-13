<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

const route = useRoute()
const catalogo = useCatalogo()

/**
 * Gárdase o índice e non só a especie: o ficheiro de zonas refírese ás
 * especies pola súa posición no catálogo, non polo slug.
 */
const indice = computed(() =>
  catalogo.especies.findIndex(e => e.slug === route.params.slug))

const especie = computed<Especie | undefined>(() => catalogo.especies[indice.value])

if (!especie.value) {
  throw createError({ statusCode: 404, statusMessage: 'Especie non atopada', fatal: true })
}

const titulo = computed(() => nomeMostrado(especie.value!))

useHead(() => ({ title: `${titulo.value} — Paxariñas` }))

/** Especies coas que se confunde: mesma familia e tamaño semellante. */
const parecidas = computed(() =>
  (especie.value?.parecidas ?? [])
    .map(i => catalogo.especies[i])
    .filter((e): e is Especie => !!e))

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
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>

    <h1 class="titulo">{{ titulo }}</h1>
    <p class="cientifico">
      <em>{{ especie.cientifico }}</em>
      <span v-if="especie.autoria" class="autoria">{{ especie.autoria }}</span>
    </p>

    <!-- A foto e o botón van xuntos: marcar unha ave é o que se fai nada máis
         recoñecela, así que ten que estar arriba e non ao final da ficha. En
         pantalla ancha vai ao carón; en móbil cae debaixo. -->
    <div class="cabeza">
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

      <ClientOnly>
        <MarcarVista :slug="especie.slug" />
      </ClientOnly>
    </div>

    <section class="bloque">
      <h2>Máis fotos</h2>
      <ClientOnly>
        <GaleriaEspecie :slug="especie.slug" :nome="titulo" />
      </ClientOnly>
    </section>

    <p v-if="!especie.nomes.gl" class="aviso">
      Esta especie aínda non ten nome galego no catálogo. É un dos ocos que
      queda por encher.
    </p>

    <section v-if="especie.rasgos" class="bloque">
      <h2>Como é</h2>
      <dl class="datos">
        <template v-if="especie.rasgos.comparanza">
          <dt>Tamaño</dt>
          <!-- «ave» diante: as clases de tamaño están en feminino porque
               concordan coa ave, e "Tamaño: pequena" non casaría. -->
          <dd>
            ave {{ especie.rasgos.tamano }},
            <span class="suave">{{ especie.rasgos.comparanza }}</span>
          </dd>
        </template>
        <template v-if="especie.rasgos.masa">
          <dt>Peso</dt>
          <dd>{{ especie.rasgos.masa }} g</dd>
        </template>
        <template v-if="especie.rasgos.habitat">
          <dt>Onde vive</dt>
          <dd>{{ especie.rasgos.habitat }}</dd>
        </template>
        <template v-if="especie.rasgos.come">
          <dt>Que come</dt>
          <dd>{{ especie.rasgos.come }}</dd>
        </template>
      </dl>
      <p class="fonte">
        Medidas de <a href="https://doi.org/10.1111/ele.13898">AVONET</a>
        (Tobias et al. 2022), CC BY 4.0.
      </p>
    </section>

    <section v-if="parecidas.length" class="bloque">
      <h2>Fáciles de confundir</h2>
      <p class="fonte fonte--arriba">
        Da mesma familia e dun tamaño semellante.
      </p>
      <ul class="parecidas">
        <li v-for="p in parecidas" :key="p.slug">
          <NuxtLink :to="`/especie/${p.slug}`" class="parecida">
            <img
              v-if="p.foto" :src="p.foto.mini" :alt="nomeMostrado(p)"
              class="parecida__foto" width="56" height="56"
              loading="lazy" decoding="async"
            >
            <span v-else class="parecida__foto parecida__foto--baleira" aria-hidden="true">🪶</span>
            <span class="parecida__nomes">
              <span class="parecida__nome">{{ nomeMostrado(p) }}</span>
              <span class="parecida__sci">{{ p.cientifico }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

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

    <section v-if="especie.canto" class="bloque">
      <h2>Como soa</h2>
      <ReproducirCanto :canto="especie.canto" :especie="titulo" />
    </section>

    <section v-if="especie.fenoloxia && especie.fenoloxia.total" class="bloque">
      <h2>Cando se ve</h2>
      <p v-if="especie.fenoloxia.fiable" class="estatus">
        <span class="estatus__pílula">{{ especie.fenoloxia.estatus }}</span>
      </p>
      <p v-else class="estatus estatus--incerto">
        Poucas citas para dicir en que época aparece.
      </p>

      <BarraMeses :fenoloxia="especie.fenoloxia" />

      <p class="fonte">
        {{ catalogo.avisoFenoloxia }}
      </p>
    </section>

    <section class="bloque">
      <h2>Onde se ve</h2>
      <!-- Só no cliente: renderizado no servidor, os 81 kB de xeometría das 53
           comarcas quedan incrustados en cada unha das 517 fichas e disparan o
           precache de 15 a 61 MB. A xeometría xa viaxa nun chunk compartido. -->
      <ClientOnly>
        <MapaEspecie :indice="indice" :nome="titulo" />
        <template #fallback>
          <div class="mapa-oco esqueleto" aria-hidden="true" />
        </template>
      </ClientOnly>
      <p class="fonte">
        Son citas rexistradas, non abundancia: hai máis citas onde hai máis
        xente mirando. <NuxtLink to="/mapa">Ver todas as comarcas</NuxtLink>.
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
/* `.volver`, `.bloque`, `.datos`, `.fonte` e `.aviso` xa non se declaran aquí:
   viven en base.css, que é onde estaban repetidos catro veces con valores
   lixeiramente distintos en cada páxina. */

.titulo {
  margin: 0.6rem 0 0.1rem;
}

/* O nome científico é a segunda liña da cabeceira da ficha, non un dato máis:
   vai en cursiva e con corpo menor, e a autoría aínda menor detrás. */
.cientifico {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
  margin: 0 0 var(--oco-g);
  font-size: 1.05rem;
  color: var(--tinta-suave);
}

.autoria {
  font-size: 0.8rem;
  color: var(--granito);
}

/* A foto ten 500 px de tope, así que en pantalla ancha sobra sitio ao seu
   carón para o botón. Por debaixo diso, apílanse. */
.cabeza {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem 1.5rem;
  margin-bottom: var(--oco-g);
}

.foto {
  margin: 0;
  flex: 1 1 22rem;
  max-width: 500px;
}

.foto img {
  display: block;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 25 / 18;
  object-fit: cover;
  background: var(--bretema);
  border-radius: var(--raio-g);
  box-shadow: var(--sombra-alta);
}

.foto figcaption {
  max-width: 500px;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--tinta-suave);
}

.aviso {
  margin-bottom: var(--oco);
}

.nome-gl {
  font-size: 1.3rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 0;
}

.estatus {
  margin: 0 0 0.75rem;
}

/* O estatus é unha interpretación, non un dato medido: vai como pílula ao lado
   da barra de meses, que é a evidencia, e non como titular. */
.estatus__pílula {
  display: inline-block;
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  background: var(--fento-tenue);
  color: var(--fento);
  border: 1px solid color-mix(in srgb, var(--fento) 30%, transparent);
  font-weight: 650;
  font-size: 0.95rem;
  text-transform: capitalize;
}

.estatus--incerto {
  font-size: 0.9rem;
  color: var(--tinta-suave);
  text-transform: none;
}

/* Reserva o oco do mapa mentres monta no cliente, para que non salte o resto
   da ficha. Galicia é case cadrada, e o lenzo ten a mesma anchura máxima.
   Como esqueleto e non como rectángulo morto: así dise que vén algo. */
.suave {
  color: var(--tinta-suave);
}

/* A nota de fonte vai antes da lista neste bloque: di baixo que criterio está
   feita, e iso hai que sabelo antes de mirala, non despois. */
.fonte--arriba {
  margin: -0.2rem 0 0.6rem;
}

.parecidas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
}

.parecida {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem;
  border-radius: var(--raio);
  text-decoration: none;
  color: inherit;
  transition: background var(--saída);
}

.parecida:hover {
  background: var(--bretema);
}

.parecida__foto {
  width: 2.75rem;
  height: 2.75rem;
  object-fit: cover;
  border-radius: var(--raio-p, 4px);
  background: var(--bretema);
  flex: none;
}

.parecida__foto--baleira {
  display: grid;
  place-items: center;
  opacity: 0.35;
}

.parecida__nomes {
  min-width: 0;
}

.parecida__nome {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
}

.parecida__sci {
  display: block;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--tinta-suave);
}

.mapa-oco {
  width: 100%;
  max-width: 26rem;
  aspect-ratio: 1 / 1;
}
</style>
