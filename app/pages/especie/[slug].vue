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

/**
 * Aviso de que esta especie ten fotos separadas por plumaxe.
 *
 * Dise o que hai, non o que significa. Que Commons teña subcategorías de macho
 * e femia adoita implicar que se distinguen a simple vista, pero «o macho e a
 * femia non se parecen» sería unha interpretación nosa, e nunha guía de
 * identificación iso non se afirma sen sabelo.
 */
const avisoPlumaxes = computed(() => {
  const p = especie.value?.plumaxes ?? []
  if (!p.length) return null

  // Termos soltos e non «macho e femia» xunto: se non, ao unir a lista sae
  // «macho e femia e xuvenís».
  const partes: string[] = []
  if (p.includes('macho') && p.includes('femia')) partes.push('macho', 'femia')
  if (p.includes('nupcial') || p.includes('inverno')) partes.push('plumaxe segundo a época')
  if (p.includes('eclipse')) partes.push('plumaxe de eclipse')
  if (p.includes('xuvenil')) partes.push('xuvenís')

  if (!partes.length) return null
  const lista = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
  return `Hai fotos de ${lista}.`
})

/**
 * As etiquetas que van enriba da foto: o que se quere saber dun paxaro nada máis
 * velo. Só as que son certas — nada de ocos con guión.
 *
 * O estatus só se amosa se a fenoloxía é fiable: cunhas poucas citas o cálculo
 * non dá para afirmar «residente» en letras grandes sobre a foto.
 */
const etiquetas = computed(() => {
  const e = especie.value
  if (!e) return []
  const saida: string[] = []
  if (e.fenoloxia?.fiable && e.fenoloxia.estatus) saida.push(e.fenoloxia.estatus)
  if (e.rasgos?.tamano) {
    saida.push(e.rasgos.comparanza
      ? `${e.rasgos.tamano}, ${e.rasgos.comparanza}`
      : `ave ${e.rasgos.tamano}`)
  }
  if (e.familia) saida.push(e.familia)
  if (e.rara) saida.push('rara en Galicia')
  return saida
})

/** A data en que se marcou, para a liña de debaixo da foto. */
const { dataDe } = useVistas()
const dataVista = computed(() => {
  const d = especie.value ? dataDe(especie.value.slug) : null
  if (!d) return null
  const [ano, mes, dia] = d.split('-')
  const MESES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
    'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro']
  const nome = MESES[Number(mes) - 1]
  return nome ? `${Number(dia)} de ${nome} de ${ano}` : d
})

/**
 * A orde das tarxetas, ao gusto de quen usa a app. Lese no cliente: no
 * prerenderizado non hai `localStorage` e devolver alí outra orde rompería a
 * hidratación das 518 fichas.
 */
const { posicion, carga } = useOrdeSeccions()
onMounted(carga)

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
    <!-- ─── Foto a sangre ───────────────────────────────────────────────────
         O nome vai ENRIBA da foto, e o latín debaixo e menor. É a peza que
         cambia a ficha de rexistro a lámina de guía.

         Aquí a foto si se recorta (`object-fit: cover`), ao revés que antes.
         Non se perde a cabeza do paxaro porque o encadre non é o centro: sae
         de `encadre()`, que sobe o punto de mira canto máis vertical sexa a
         foto. A imaxe enteira e sen recortar segue estando a un toque, en
         «Máis fotos». -->
    <header class="heroe" :class="{ 'heroe--sen-foto': !especie.foto }">
      <img
        v-if="especie.foto"
        class="heroe__foto"
        :src="especie.foto.grande"
        :alt="`${titulo} (${especie.cientifico})`"
        :style="{ objectPosition: encadre(especie.foto) }"
        :width="especie.foto.anchoGrande ?? 500"
        :height="especie.foto.altoGrande ?? 360"
        decoding="async"
      >
      <span v-else class="heroe__baleiro" aria-hidden="true"><IconaPluma /></span>

      <!-- Dous degradados: un arriba para que se lean os botóns e outro abaixo
           para o nome. Sen eles, unha foto de ceo branco deixaba todo ilexible. -->
      <div class="heroe__veo" aria-hidden="true" />

      <div class="heroe__accions">
        <NuxtLink to="/" class="heroe__volver" aria-label="Volver a todas as aves">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </NuxtLink>
        <ClientOnly>
          <MarcarVista :slug="especie.slug" compacto />
        </ClientOnly>
      </div>

      <div class="heroe__pe">
        <h1 class="heroe__nome">{{ titulo }}</h1>
        <p class="heroe__sci">
          <em>{{ especie.cientifico }}</em>
          <span v-if="especie.autoria" class="heroe__autoria">{{ especie.autoria }}</span>
        </p>
        <p v-if="etiquetas.length" class="heroe__etiquetas">
          <span v-for="e in etiquetas" :key="e" class="heroe__etiqueta">{{ e }}</span>
        </p>
      </div>
    </header>

    <!-- Atribución da foto e, á dereita, a rodiña de axustes.
         A rodiña estaba na barra verde e baixou aquí: o único que hai dentro é
         a orde das seccións da ficha, así que na portada ou no mapa era un
         botón que non levaba a nada útil. Aquí está onde se usa. -->
    <div class="baixo-foto">
      <p v-if="especie.foto" class="creditos">
      <span v-if="especie.foto.autor">{{ especie.foto.autor }} · </span>
      <!-- `ligazon`: a URL da licenza vén de `extmetadata` de Commons, que
           edita calquera. Sen enlace válido queda o nome da licenza, que é
           o que esixe a atribución. -->
      <a v-if="ligazon(especie.foto.licenzaUrl)" :href="ligazon(especie.foto.licenzaUrl)!" rel="license">
        {{ especie.foto.licenza }}
      </a>
      <span v-else>{{ especie.foto.licenza }}</span>
      <template v-if="ligazon(especie.foto.orixe)">
        · <a :href="ligazon(especie.foto.orixe)!">Wikimedia Commons</a>
      </template>
      <!-- A data de marcada, que na pílula da foto non cabe. -->
        <ClientOnly>
          <span v-if="dataVista" class="creditos__vista"> · Marcada o {{ dataVista }}</span>
        </ClientOnly>
      </p>

      <ClientOnly>
        <AxustesCaixon />
      </ClientOnly>
    </div>

    <!-- `order` de CSS: as seccións móvense sen mudar de sitio no DOM.
         Ver `useOrdeSeccions` para por que non se sacaron a compoñentes. -->
    <div class="seccions">
      <!-- O son vai pegado á foto: recoñecer un paxaro polo que canta é o
           segundo que se fai despois de mirar a imaxe, non algo do final. -->
      <section v-if="especie.cantos.length" class="bloque" :style="{ order: posicion('son') }">
        <h2>Como soa</h2>
        <div class="sons">
          <ReproducirCanto
            v-for="c in especie.cantos" :key="c.ficheiro"
            :canto="c" :especie="titulo"
          />
        </div>
      </section>

      <section class="bloque" :style="{ order: posicion('fotos') }">
        <h2>Máis fotos</h2>

        <!-- Vai enriba do botón e non dentro da galería: agrupar por plumaxe é do
             que máis axuda a identificar, e quedaba agochado tras un clic. Quen
             abre o lavanco e ve unha foto de macho non tiña como saber que a
             femia estaba aí ao lado. -->
        <p v-if="avisoPlumaxes" class="plumaxes">
          <strong>{{ avisoPlumaxes }}</strong>
          As fotos van separadas por grupos.
        </p>

        <ClientOnly>
          <GaleriaEspecie :slug="especie.slug" :nome="titulo" />
        </ClientOnly>
      </section>

      <p v-if="!especie.nomes.gl" class="aviso">
        Esta especie aínda non ten nome galego no catálogo. É un dos ocos que
        queda por encher.
      </p>

      <section v-if="especie.descricion" class="bloque" :style="{ order: posicion('que-e') }">
        <h2>Que é</h2>
        <p class="descricion">{{ especie.descricion.texto }}</p>
        <!-- A URL constrúea o ETL cun dominio fixo, así que non debería facer
             falta; pasa por `ligazon` igual, que é a regra en toda a app: ningún
             `href` que veña do catálogo se pinta sen comprobar o esquema. -->
        <p class="fonte">
          <a v-if="ligazon(especie.descricion.url)" :href="ligazon(especie.descricion.url)!">
            Wikipedia en {{ especie.descricion.idioma === 'gl' ? 'galego' : 'castelán' }}
          </a>
          <span v-else>Wikipedia en {{ especie.descricion.idioma === 'gl' ? 'galego' : 'castelán' }}</span>, CC BY-SA.
        </p>
      </section>

      <section v-if="especie.conservacion" class="bloque" :style="{ order: posicion('conservacion') }">
        <h2>Estado de conservación</h2>
        <p class="estado">
          <span
            class="estado__pílula"
            :class="{ 'estado__pílula--ameaza': especie.conservacion.ameazada }"
          >
            {{ especie.conservacion.codigo }}
          </span>
          {{ especie.conservacion.texto }}
        </p>
        <p class="fonte">
          Lista Vermella da
          <a href="https://www.iucnredlist.org">UICN</a>, vía Wikidata. É a
          avaliación mundial da especie, non a súa situación en Galicia.
        </p>
      </section>

      <section v-if="especie.rasgos" class="bloque" :style="{ order: posicion('como-e') }">
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

      <section v-if="parecidas.length" class="bloque" :style="{ order: posicion('parecidas') }">
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
              <span v-else class="parecida__foto parecida__foto--baleira" aria-hidden="true"><IconaPluma /></span>
              <span class="parecida__nomes">
                <span class="parecida__nome">{{ nomeMostrado(p) }}</span>
                <span class="parecida__sci">{{ p.cientifico }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="bloque" :style="{ order: posicion('clasificacion') }">
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

      <section v-if="especie.nomes.gl" class="bloque" :style="{ order: posicion('nome-galego') }">
        <h2>Nome galego</h2>
        <p class="nome-gl">{{ especie.nomes.gl }}</p>
        <p class="fonte">Fonte: {{ especie.nomes.glFonte }}</p>
      </section>

      <section v-if="outrosNomes.length" class="bloque" :style="{ order: posicion('idiomas') }">
        <h2>Noutros idiomas</h2>
        <dl class="datos">
          <template v-for="n in outrosNomes" :key="n.idioma">
            <dt>{{ n.idioma }}</dt>
            <dd>{{ n.nome }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="especie.fenoloxia && especie.fenoloxia.total" class="bloque" :style="{ order: posicion('cando') }">
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

      <section class="bloque" :style="{ order: posicion('onde') }">
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

      <section class="bloque" :style="{ order: posicion('galicia') }">
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
    </div>

    <!-- Ao final da ficha, cando xa se viu todo o que podería estar mal.
         Ordenar as seccións xa non está aquí: vive no caixón de axustes da
         cabeceira, porque a orde vale para as 518 fichas e non só para esta. -->
    <ClientOnly>
      <AvisarErro :especie="especie" />
    </ClientOnly>
  </article>
</template>

<style scoped>
/* As seccións reordénanse con `order`, e para iso o pai ten que ser flex. */
.seccions {
  display: flex;
  flex-direction: column;
}

/* `.volver`, `.bloque`, `.datos`, `.fonte` e `.aviso` xa non se declaran aquí:
   viven en base.css, que é onde estaban repetidos catro veces con valores
   lixeiramente distintos en cada páxina. */

/* ─── Foto a sangre ──────────────────────────────────────────────────────────
   A imaxe rompe a marxe do contido. `-1rem` cancela xusto o padding lateral de
   `.contido`, e non `calc(50% - 50vw)`: iso conta a barra de desprazamento como
   ancho e mete un desbordamento horizontal en escritorio. Así queda de bordo a
   bordo no móbil e do ancho da columna en pantalla grande, que é onde ten
   sentido que non se coma a pantalla enteira. */
.heroe {
  position: relative;
  margin: calc(var(--oco) * -1.5) -1rem var(--oco-p);
  /* Alta abondo para que o paxaro se vexa, pero nunca tanto que o nome quede
     fóra da primeira pantalla nun móbil apaisado. */
  height: clamp(17rem, 52vh, 26rem);
  overflow: hidden;
  background: var(--fento-tenue);
  isolation: isolate;
}

@media (min-width: 46rem) {
  .heroe {
    margin-inline: 0;
    border-radius: var(--raio-g);
  }
}

.heroe__foto {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.heroe--sen-foto {
  display: grid;
  place-items: center;
  height: 12rem;
}

.heroe__baleiro {
  font-size: 4rem;
  opacity: 0.7;
}

/* Dous degradados nun só elemento: arriba para os botóns, abaixo para o nome.
   Sen isto, unha foto de ceo branco deixaba o texto branco ilexible. */
.heroe__veo {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom,
      rgb(20 23 15 / 55%) 0%,
      rgb(20 23 15 / 0%) 26%,
      rgb(20 23 15 / 0%) 42%,
      rgb(20 23 15 / 82%) 100%);
}

.heroe__accions {
  position: absolute;
  top: 0.7rem;
  left: 0.7rem;
  right: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

/* 44 px: o mínimo táctil que fixa o sistema de deseño. */
.heroe__volver {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 30%);
  background: rgb(20 23 15 / 45%);
  backdrop-filter: blur(6px);
  color: #fff;
  transition: background var(--saída);
}

.heroe__volver:hover {
  background: rgb(20 23 15 / 62%);
  color: #fff;
}

.heroe__volver svg {
  width: 1.35rem;
  height: 1.35rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.heroe__pe {
  position: absolute;
  left: 1.15rem;
  right: 1.15rem;
  bottom: 0.9rem;
  color: #fff;
  /* O texto vai sempre sobre o degradado, nunca sobre a foto espida. */
  text-shadow: 0 1px 3px rgb(20 23 15 / 45%);
}

.heroe__nome {
  margin: 0;
  font-size: clamp(1.9rem, 1.3rem + 3vw, 2.6rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
  color: #fff;
  text-wrap: balance;
}

.heroe__sci {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
  margin: 0.2rem 0 0;
  font-family: var(--fonte-titulo);
  font-style: italic;
  font-size: 1.02rem;
  opacity: 0.9;
}

/* A autoría do binomio («Linnaeus, 1758») vai en redonda: por convención
   taxonómica a cursiva é só do xénero e a especie. */
.heroe__autoria {
  font-family: var(--fonte);
  font-style: normal;
  font-size: 0.78rem;
  opacity: 0.85;
}

.heroe__etiquetas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.6rem 0 0;
}

.heroe__etiqueta {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 35%);
  background: rgb(255 255 255 / 18%);
  backdrop-filter: blur(4px);
  font-size: 0.72rem;
  font-weight: 650;
  /* Sen `text-transform`: aquí conviven un estatus en minúscula («residente») e
     un nome de familia que é un nome propio («Muscicapidae»). Forzando
     minúsculas, o segundo saía mal escrito. */
}

/* Debaixo da foto: a atribución á esquerda e a rodiña á dereita, aliñadas
   arriba porque a atribución pode ocupar dúas liñas. */
.baixo-foto {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: var(--oco);
}

/* Atribución da foto: discreta, pero presente. Non é adorno. */
.creditos {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--tinta-suave);
}

.creditos__vista {
  color: var(--fento);
  font-weight: 600;
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

.descricion {
  margin: 0;
  max-width: 44rem;
  text-wrap: pretty;
}

/* Non é un aviso de erro: é unha pista útil. Verde tenue, coma o resto do que
   engade información na app, e non o amarelo do toxo que marca advertencias. */
/* Canto e reclamo, un ao lado do outro. Nun móbil de 360 px dous botóns de
   ~165 px seguen collendo o nome e o lugar; por debaixo diso apílanse. */
.sons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

@media (max-width: 22rem) {
  .sons {
    grid-template-columns: 1fr;
  }
}

.plumaxes {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--fento);
  border-radius: 0 var(--raio) var(--raio) 0;
  background: var(--fento-tenue);
  font-size: 0.9rem;
}

.plumaxes strong {
  font-weight: 650;
}

.estado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

/* O código da UICN vai como pílula: é unha etiqueta normalizada, non prosa.
   Só se tinta de alerta a partir de «vulnerable»; pintar de vermello un
   «pouco preocupante» sería alarmar por nada. */
.estado__pílula {
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  background: var(--fento-tenue);
  color: var(--fento);
  border: 1px solid color-mix(in srgb, var(--fento) 30%, transparent);
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
}

.estado__pílula--ameaza {
  background: color-mix(in srgb, var(--toxo) 22%, transparent);
  color: color-mix(in srgb, var(--toxo) 70%, var(--tinta));
  border-color: color-mix(in srgb, var(--toxo) 45%, transparent);
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
  font-family: var(--fonte-titulo);
  font-size: 0.78rem;
  font-style: italic;
  color: var(--tinta-suave);
}

.mapa-oco {
  width: 100%;
  max-width: 26rem;
  aspect-ratio: 1 / 1;
}
</style>
