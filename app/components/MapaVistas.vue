<script setup lang="ts">
import type { Especie } from '~/types/catalogo'
import type { Vista } from '~/composables/useVistas'

/**
 * Onde viches cada ave, sobre o mapa de Galicia.
 *
 * Debúxase co mesmo SVG de comarcas que /mapa e coa mesma proxección, así que
 * non hai teselas nin ningunha petición: isto mírase despois dunha saída, moitas
 * veces aínda no monte e sen cobertura, e un mapa que precise rede estaría en
 * branco xusto aí. Tampouco sae de aquí ningunha coordenada, que é o que se
 * prometeu ao gardalas.
 */
const props = defineProps<{
  marcas: { vista: Vista, especie: Especie }[]
}>()

const { zonas } = useZonas()

/** Só as que teñen sitio, e as máis recentes ao final para que queden enriba. */
const conSitio = computed(() =>
  props.marcas
    .filter(m => m.vista.lugar)
    .sort((a, b) => a.vista.data.localeCompare(b.vista.data)))

interface Chincheta {
  slug: string
  nome: string
  data: string
  x: number
  y: number
  /** A incerteza do GPS, en unidades do debuxo. */
  radio: number
}

const METROS_POR_GRAO = 111320

const chinchetas = computed<Chincheta[]>(() => conSitio.value.map(({ vista, especie }) => {
  const { lon, lat, precision } = vista.lugar!
  const [x, y] = aLenzo([lon, lat])
  return {
    slug: especie.slug,
    nome: nomeMostrado(especie),
    data: vista.data,
    x,
    y,
    radio: (precision / METROS_POR_GRAO) * lenzo.escala,
  }
}))

/**
 * As que caen fóra do encadre: unha ave marcada en Asturias ou en Lisboa
 * debuxaríase fóra do SVG e simplemente non se vería. Non se moven ao bordo
 * —iso sería mentir sobre onde as viches— senón que se contan aparte.
 */
const fóra = computed(() => chinchetas.value.filter(
  c => c.x < 0 || c.y < 0 || c.x > lenzo.largo || c.y > lenzo.alto))

const dentro = computed(() => chinchetas.value.filter(c => !fóra.value.includes(c)))

/**
 * Cando dúas marcas están no mesmo sitio, unha tapa a outra e o mapa mente
 * sobre cantas hai. Contáronse por celda dunha grella grosa: non se separan os
 * puntos, que iso movería a marca, pero si se di cantas hai debaixo.
 */
const CELDA = 12

const grupos = computed(() => {
  const conta = new Map<string, number>()
  for (const c of dentro.value) {
    const clave = `${Math.round(c.x / CELDA)}:${Math.round(c.y / CELDA)}`
    conta.set(clave, (conta.get(clave) ?? 0) + 1)
  }
  return conta
})

const seleccionada = ref<string | null>(null)

/**
 * A chincheta escollida, ou ningunha. Hai unha marca por especie —`marca()`
 * sae se xa a viches— así que non pode haber dúas co mesmo slug.
 */
const detalle = computed(() =>
  dentro.value.find(c => c.slug === seleccionada.value) ?? null)
</script>

<template>
  <figure v-if="chinchetas.length" class="mapa">
    <!-- `role="group"` e non `role="img"`: cunha imaxe, os lectores de pantalla
         non expoñen o que hai dentro, e aquí dentro hai botóns de verdade. -->
    <svg
      :viewBox="lenzo.viewBox" class="mapa__lenzo"
      role="group"
      :aria-label="`Mapa de Galicia con ${dentro.length} ${dentro.length === 1 ? 'marca' : 'marcas'}`"
    >
      <!-- As comarcas van todas do mesmo ton e sen ningún dato dentro: aquí o
           que conta son as chinchetas, e un mapa coloreado por citas
           competiría con elas. -->
      <g class="mapa__terra">
        <path v-for="z in zonas" :key="z.id" :d="trazo(z)" />
      </g>

      <g>
        <g
          v-for="c in dentro" :key="`${c.slug}-${c.data}`"
          class="chincheta" :class="{ 'chincheta--posta': seleccionada === c.slug }"
          role="button" tabindex="0"
          :aria-label="`${c.nome}, ${c.data}`"
          :aria-pressed="seleccionada === c.slug"
          @click="seleccionada = seleccionada === c.slug ? null : c.slug"
          @keydown.enter.prevent="seleccionada = c.slug"
          @keydown.space.prevent="seleccionada = c.slug"
        >
          <title>{{ c.nome }} · {{ c.data }}</title>
          <!-- Área de toque, invisible. O punto ten 14 px de diámetro nun
               móbil e iso non se acerta co dedo. Non chega aos 44 px que pide
               o sistema de deseño —a esa distancia dúas chinchetas próximas
               solaparíanse e non habería xeito de escoller a certa— pero
               dobra o branco real. -->
          <circle class="chincheta__toque" :cx="c.x" :cy="c.y" r="24" />
          <!-- O halo é a incerteza que deu o GPS, á escala do mapa. Nunha
               marca tomada baixo teito pode ser máis grande ca o punto, e iso
               é xusto o que hai que ver. -->
          <circle v-if="c.radio > 2" class="chincheta__halo" :cx="c.x" :cy="c.y" :r="c.radio" />
          <circle
            class="chincheta__punto" :cx="c.x" :cy="c.y"
            :r="seleccionada === c.slug ? 11 : 7"
          />
        </g>
      </g>
    </svg>

    <figcaption class="mapa__pé">
      <template v-if="detalle">
        <strong>{{ detalle.nome }}</strong>
        <span class="mapa__cando">{{ detalle.data }}</span>
        <NuxtLink :to="`/especie/${detalle.slug}`" class="ligazon">Ver a ficha</NuxtLink>
        <button class="ligazon" @click="seleccionada = null">Quitar</button>
      </template>
      <template v-else>
        {{ dentro.length }} {{ dentro.length === 1 ? 'marca' : 'marcas' }} con sitio.
        Preme nunha para saber cal é.
        <span v-if="[...grupos.values()].some(n => n > 1)" class="mapa__aviso">
          Hai marcas superpostas: no mesmo sitio viches máis dunha ave.
        </span>
        <span v-if="fóra.length" class="mapa__aviso">
          {{ fóra.length }} {{ fóra.length === 1 ? 'marca queda' : 'marcas quedan' }}
          fóra de Galicia e non {{ fóra.length === 1 ? 'se ve' : 'se ven' }} aquí.
        </span>
      </template>
    </figcaption>
  </figure>
</template>

<style scoped>
.mapa {
  margin: 0 0 var(--oco);
}

.mapa__lenzo {
  display: block;
  width: 100%;
  height: auto;
  /* Que non se estire nunha pantalla ancha: o mapa non gaña nada por ser
     enorme e a listaxe é o que se vén ver. */
  max-height: 60vh;
  overflow: visible;
}

.mapa__terra path {
  fill: color-mix(in srgb, var(--fento) 16%, transparent);
  stroke: color-mix(in srgb, var(--fento) 40%, transparent);
  stroke-width: 1;
  stroke-linejoin: round;
}

/* «Chincheta» e non «marca»: a marca da cabeceira, o logotipo, xa se chama
   así. Os estilos non se pisan por ser scoped, pero dous `.marca` distintos na
   mesma páxina confunden a quen os lea, e a un test xa o enganaron. */
.chincheta {
  cursor: pointer;
}

.chincheta__toque {
  fill: transparent;
}

.chincheta__halo {
  fill: color-mix(in srgb, var(--papo) 22%, transparent);
}

/* O radio vai no atributo e non en CSS: `r` como propiedade de CSS non a dan
   todos os navegadores, e aquí é a diferenza entre ver cal está escollida ou
   non vela. */
.chincheta__punto {
  fill: var(--papo);
  stroke: var(--papel);
  stroke-width: 2.5;
  transition: stroke-width var(--saída);
}

.chincheta:hover .chincheta__punto {
  stroke-width: 3.5;
}

/* Escollida: cámbiaselle o bordo, non só o tamaño. Sen isto a única pista de
   cal se premeu era o anel de foco que pinta o navegador, que nin sequera sae
   sempre —depende de se se chegou co dedo ou co tabulador. */
.chincheta--posta .chincheta__punto {
  stroke: var(--tinta);
  stroke-width: 3;
}

/* O foco vai no punto e non nun rectángulo arredor do grupo, que co halo
   quedaría enorme e desprazado. */
.chincheta:focus {
  outline: none;
}

.chincheta:focus-visible .chincheta__punto {
  stroke: var(--foco);
  stroke-width: 3.5;
}

.mapa__pé {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.6rem;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.mapa__pé strong {
  color: var(--tinta);
  font-size: 1rem;
}

.mapa__cando {
  font-variant-numeric: tabular-nums;
}

.mapa__aviso {
  flex-basis: 100%;
}
</style>
