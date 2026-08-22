<script setup lang="ts">
import type { Especie, Zona } from '~/types/catalogo'
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
    .filter(m => m.vista.sitio)
    .sort((a, b) => a.vista.data.localeCompare(b.vista.data)))

interface Chincheta {
  especie: Especie
  slug: string
  nome: string
  data: string
  x: number
  y: number
  /** A incerteza do GPS, en unidades do debuxo. */
  radio: number
  /** En que provincia caeu, para saber onde encadrar. Null se está fóra. */
  provincia: string | null
}

const METROS_POR_GRAO = 111320

const chinchetas = computed<Chincheta[]>(() => conSitio.value.map(({ vista, especie }) => {
  const { lon, lat, precision } = vista.sitio!
  const [x, y] = aLenzo([lon, lat])
  return {
    especie,
    slug: especie.slug,
    nome: nomeMostrado(especie),
    data: vista.data,
    x,
    y,
    radio: (precision / METROS_POR_GRAO) * lenzo.escala,
    provincia: zonaDe(lon, lat)?.provincia ?? null,
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
 *
 * A celda vai en unidades de pantalla e non do debuxo: ao achegarse, dúas
 * marcas que estaban pegadas sepáranse de verdade, e o aviso ten que
 * desaparecer cando xa non se solapan.
 */
const CELDA = 12

const grupos = computed(() => {
  const conta = new Map<string, number>()
  const paso = CELDA * zoom.value
  for (const c of dentro.value) {
    const clave = `${Math.round(c.x / paso)}:${Math.round(c.y / paso)}`
    conta.set(clave, (conta.get(clave) ?? 0) + 1)
  }
  return conta
})

const seleccionada = ref<string | null>(null)

const MESES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro']

/** `2026-08-14` → «14 de agosto». O ano só se di se non é o de agora. */
function dataLexible(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  const nome = MESES[Number(mes) - 1]
  if (!nome) return iso
  const actual = String(new Date().getFullYear())
  return `${Number(dia)} de ${nome}${ano === actual ? '' : ` de ${ano}`}`
}

/**
 * A chincheta escollida, ou ningunha. Hai unha marca por especie —`marca()`
 * sae se xa a viches— así que non pode haber dúas co mesmo slug.
 */
const detalle = computed(() =>
  dentro.value.find(c => c.slug === seleccionada.value) ?? null)

/* ── Encadre ──────────────────────────────────────────────────────────────
   Achegarse a unha provincia é mover o `viewBox`: non hai imaxes que cargar
   nin nada que recalcular, o SVG xa está debuxado enteiro. */

interface Caixa { x: number, y: number, largo: number, alto: number }

const GALICIA: Caixa = { x: 0, y: 0, largo: lenzo.largo, alto: lenzo.alto }
const PROPORCIÓN = lenzo.largo / lenzo.alto

/**
 * A caixa axústase á proporción do mapa enteiro antes de usala.
 *
 * Sen isto, cada provincia daría un SVG cunha forma distinta: como o elemento
 * leva `height: auto`, o alto sáelle da proporción do `viewBox`, e a páxina
 * pegaría un brinco cada vez que se cambia de provincia. Engádese tamén unha
 * marxe para que as marcas do bordo non queden pegadas ao canto.
 */
function encadra(caixa: Caixa, marxe = 0.07): Caixa {
  const folgura = Math.max(caixa.largo, caixa.alto) * marxe
  let { x, y } = caixa
  let largo = caixa.largo + folgura * 2
  let alto = caixa.alto + folgura * 2
  x -= folgura
  y -= folgura

  if (largo / alto > PROPORCIÓN) {
    const novoAlto = largo / PROPORCIÓN
    y -= (novoAlto - alto) / 2
    alto = novoAlto
  } else {
    const novoLargo = alto * PROPORCIÓN
    x -= (novoLargo - largo) / 2
    largo = novoLargo
  }
  return { x, y, largo, alto }
}

/** A caixa que colle todas as comarcas dunha provincia. */
const caixasProvincia = computed(() => {
  const caixas = new Map<string, Caixa>()
  const límites = new Map<string, [number, number, number, number]>()

  for (const z of zonas) {
    if (!z.provincia) continue
    const l = límites.get(z.provincia) ?? [Infinity, Infinity, -Infinity, -Infinity]
    for (const anel of z.aneis) {
      for (const punto of anel) {
        const [x, y] = aLenzo(punto)
        if (x < l[0]) l[0] = x
        if (y < l[1]) l[1] = y
        if (x > l[2]) l[2] = x
        if (y > l[3]) l[3] = y
      }
    }
    límites.set(z.provincia, l)
  }

  for (const [nome, [minX, minY, maxX, maxY]] of límites) {
    caixas.set(nome, encadra({ x: minX, y: minY, largo: maxX - minX, alto: maxY - minY }))
  }
  return caixas
})

/** A caixa dunha comarca soa: o segundo chanzo de zoom. */
function caixaDaComarca(z: Zona): Caixa {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const anel of z.aneis) {
    for (const punto of anel) {
      const [x, y] = aLenzo(punto)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return encadra({ x: minX, y: minY, largo: maxX - minX, alto: maxY - minY }, 0.15)
}

/**
 * A caixa que colle as túas marcas, que é o encadre co que se abre.
 *
 * Achegarse á provincia non abondaba: A Coruña ocupa tres cuartos do mapa e
 * quedaba en 1,3 aumentos, coas marcas igual de xuntas. Quen sae sempre polos
 * mesmos montes quere ver ESES montes, non a provincia.
 *
 * O mínimo son 60 unidades, uns 16 km: cunha soa marca, ou con dúas na mesma
 * aldea, sen tope o encadre pecharíase ata un anaco de mapa no que non se
 * recoñece nada, porque debaixo non hai rúas nin relevo que mirar —só o
 * contorno da comarca.
 */
const MÍNIMO = 60

const caixaDasMarcas = computed<Caixa | null>(() => {
  if (!dentro.value.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of dentro.value) {
    if (c.x < minX) minX = c.x
    if (c.y < minY) minY = c.y
    if (c.x > maxX) maxX = c.x
    if (c.y > maxY) maxY = c.y
  }
  const largo = Math.max(maxX - minX, MÍNIMO)
  const alto = Math.max(maxY - minY, MÍNIMO)
  return encadra({
    x: (minX + maxX) / 2 - largo / 2,
    y: (minY + maxY) / 2 - alto / 2,
    largo,
    alto,
  }, 0.18)
})

/** As provincias nas que tes marcas, coa conta. Non se ofrecen as baleiras. */
const provinciasConMarcas = computed(() => {
  const conta = new Map<string, number>()
  for (const c of dentro.value) {
    if (c.provincia) conta.set(c.provincia, (conta.get(c.provincia) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
})

/**
 * Que se está a mirar. Un só estado para os catro chanzos, que non poden
 * darse á vez: as marcas, Galicia enteira, unha provincia ou unha comarca.
 */
type Foco =
  | { tipo: 'marcas' }
  | { tipo: 'galicia' }
  | { tipo: 'provincia', nome: string }
  | { tipo: 'comarca', zona: Zona }

const foco = ref<Foco>({ tipo: 'galicia' })

const provincia = computed(() => {
  const f = foco.value
  if (f.tipo === 'provincia') return f.nome
  if (f.tipo === 'comarca') return f.zona.provincia
  return null
})

/** O `viewBox` que se está a amosar. Móvese animado, así que é estado. */
const caixa = ref<Caixa>({ ...GALICIA })
const viewBox = computed(() =>
  `${caixa.value.x} ${caixa.value.y} ${caixa.value.largo} ${caixa.value.alto}`)

/**
 * Canto hai que encoller o que se debuxa para que se vexa igual de grande.
 *
 * As chinchetas teñen que medir o mesmo na pantalla estea onde estea o zoom:
 * son un elemento de interface, non algo que estea no terreo. O halo é o
 * contrario —é unha distancia real— e por iso non se divide por isto.
 */
const zoom = computed(() => caixa.value.largo / lenzo.largo)

/**
 * Puntos coñecidos que serven de referencia cando se está moi preto.
 *
 * Achegado a unha comarca, o mapa é un anaco de verde sen nada dentro: non hai
 * relevo nin estradas debaixo, así que non hai xeito de saber que parte é. Os
 * hotspots de eBird que xa trae `zonas.json` resolven iso sen pedir nada á
 * rede, e ademais son sitios de ver aves, que é o que se está a mirar.
 *
 * Só desde catro aumentos: enteira, Galicia énchese de nomes e non se ven as
 * chinchetas, que son o que importa.
 */
const REFERENCIAS_DESDE = 0.25
const MAX_REFERENCIAS = 6

/** «Santiago de Compostela--Brañas do Sar» → «Brañas do Sar». */
function nomeCurto(nome: string) {
  const parte = nome.includes('--') ? nome.split('--').pop()! : nome
  return parte.replace(/,\s*(Galicia|ES|Spain).*$/i, '').trim()
}

const referencias = computed(() => {
  if (zoom.value > REFERENCIAS_DESDE) return []
  const c = caixa.value
  const saída: { nome: string, x: number, y: number, especies: number }[] = []

  for (const z of zonas) {
    for (const l of z.lugares) {
      const [x, y] = aLenzo([l.lon, l.lat])
      if (x < c.x || y < c.y || x > c.x + c.largo || y > c.y + c.alto) continue
      saída.push({ nome: nomeCurto(l.nome), x, y, especies: l.especies })
    }
  }

  // Os de máis especies primeiro: se hai que quedarse con seis, que sexan os
  // que alguén recoñecería.
  return saída.sort((a, b) => b.especies - a.especies).slice(0, MAX_REFERENCIAS)
})

let animación: number | null = null

/**
 * Lévase o encadre ata a caixa pedida en pouco máis de dous décimos.
 *
 * O `viewBox` non se pode animar con CSS, así que se interpola a man. Non é
 * adorno: cambiando de golpe, o mapa parece outro mapa e hai que buscar onde
 * quedou cada marca. Con movemento reducido vaise directo.
 */
function voa(destino: Caixa) {
  if (animación !== null) cancelAnimationFrame(animación)

  const reducido = import.meta.client
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducido) {
    caixa.value = destino
    return
  }

  const orixe = { ...caixa.value }
  const inicio = performance.now()
  const DURACIÓN = 260

  const paso = (agora: number) => {
    const t = Math.min(1, (agora - inicio) / DURACIÓN)
    // Suave ao saír e ao entrar: un movemento lineal parece un salto brusco
    // ao rematar.
    const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
    caixa.value = {
      x: orixe.x + (destino.x - orixe.x) * e,
      y: orixe.y + (destino.y - orixe.y) * e,
      largo: orixe.largo + (destino.largo - orixe.largo) * e,
      alto: orixe.alto + (destino.alto - orixe.alto) * e,
    }
    animación = t < 1 ? requestAnimationFrame(paso) : null
  }
  animación = requestAnimationFrame(paso)
}

function pecha() {
  seleccionada.value = null
}

function amosa(destino: Foco) {
  foco.value = destino
  if (destino.tipo === 'marcas') voa(caixaDasMarcas.value ?? GALICIA)
  else if (destino.tipo === 'galicia') voa(GALICIA)
  else if (destino.tipo === 'provincia') voa(caixasProvincia.value.get(destino.nome) ?? GALICIA)
  else voa(caixaDaComarca(destino.zona))
}

/**
 * Premer na terra achega un chanzo máis: Galicia → provincia → comarca.
 *
 * Faise en dous pasos e non dun golpe á comarca porque nunha comarca soa non
 * se ve nada arredor e cústache saber que parte estás mirando; e quedar na
 * provincia tampouco chega cando todas as marcas son do mesmo val, que é o
 * caso normal de quen sae sempre polo mesmo sitio. Premendo na comarca na que
 * xa estás, saes dela.
 */
function premeComarca(z: Zona) {
  pecha()
  if (!z.provincia) return

  const f = foco.value
  // Premendo na comarca na que xa estás, saes dela.
  if (f.tipo === 'comarca' && f.zona.id === z.id) {
    amosa({ tipo: 'provincia', nome: z.provincia })
    return
  }
  // Dentro da provincia, o seguinte chanzo é a comarca. Desde fóra —Galicia
  // enteira, ou as marcas, ou outra provincia— váise á comarca directamente:
  // xa se ve onde está, porque acabas de premer nela.
  amosa({ tipo: 'comarca', zona: z })
}

/**
 * Ábrese xa achegado se todas as marcas están nunha soa provincia.
 *
 * É o caso normal: quen usa isto sae polo mesmo sitio, e vendo Galicia enteira
 * as marcas amoréanse nun recuncho. Se hai marcas en máis dunha provincia,
 * ábrese enteira, que é a única vista que as amosa todas.
 */
/**
 * `Esc` pecha a mini ficha. Non é un diálogo modal —non atrapa o foco nin
 * bloquea o resto da páxina, que sería esaxerado para unha tarxeta que só
 * informa— pero pecharse coa tecla de sempre é o que espera calquera.
 */
function aoTeclear(e: KeyboardEvent) {
  if (e.key === 'Escape') pecha()
}

/**
 * Ábrese con Galicia enteira, sen achegarse só.
 *
 * Probouse a abrir xa axustado ás marcas e non convén: entrando na páxina o
 * primeiro que hai que entender é onde está un mirando, e un anaco de mapa sen
 * relevo nin nomes non o di. Galicia recoñécese pola forma. O encadre pechado
 * segue a un toque, no botón «As miñas marcas».
 */
onMounted(() => {
  window.addEventListener('keydown', aoTeclear)
})

onUnmounted(() => {
  if (animación !== null) cancelAnimationFrame(animación)
  window.removeEventListener('keydown', aoTeclear)
})
</script>

<template>
  <figure v-if="chinchetas.length" class="mapa">
    <div class="mapa__caixa">
      <!-- `role="group"` e non `role="img"`: cunha imaxe, os lectores de pantalla
           non expoñen o que hai dentro, e aquí dentro hai botóns de verdade. -->
      <svg
        :viewBox="viewBox" class="mapa__lenzo"
        role="group"
        :aria-label="`Mapa de ${provincia ?? 'Galicia'} con ${dentro.length} ${dentro.length === 1 ? 'marca' : 'marcas'}`"
      >
        <!-- As comarcas van todas do mesmo ton e sen ningún dato dentro: aquí o
             que conta son as chinchetas, e un mapa coloreado por citas
             competiría con elas.

             `vector-effect` mantén o trazo do mesmo groso ao achegarse; se non,
             ao entrar nunha provincia os bordos engordarían ata comerse o mapa. -->
        <g class="mapa__terra">
          <path
            v-for="z in zonas" :key="z.id" :d="trazo(z)"
            vector-effect="non-scaling-stroke"
            :class="{ 'mapa__fóra': provincia && z.provincia !== provincia }"
            @click="premeComarca(z)"
          />
        </g>

      <!-- Referencias de eBird. `pointer-events: none` en todo o grupo: son
           para orientarse, non para premer, e se non taparían as chinchetas. -->
        <g class="refs" aria-hidden="true">
          <g v-for="r in referencias" :key="r.nome">
            <circle :cx="r.x" :cy="r.y" :r="6 * zoom" class="refs__punto" />
            <!-- As medidas van en unidades do lenzo, non en píxeles: o mapa
                 enteiro mide 1000 unidades e ocupa uns 400 px, así que unha
                 unidade son uns 0,4 px. Un `font-size` de 11 dá letra de catro
                 píxeles e medio, que non se le; 26 dá os 10-11 px de sempre. -->
            <text
              :x="r.x + 14 * zoom" :y="r.y + 8 * zoom"
              :font-size="26 * zoom" class="refs__nome"
            >{{ r.nome }}</text>
          </g>
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
            <!-- Área de toque, invisible: 46 unidades son uns 40 px de diámetro,
                 preto dos 44 que pide o sistema de deseño para o que se toca.
                 Onde dúas chinchetas están moi xuntas as áreas píllanse, e
                 entón gaña a de enriba; para iso está o zoom, que é o que as
                 separa de verdade. -->
            <circle class="chincheta__toque" :cx="c.x" :cy="c.y" :r="46 * zoom" />
            <!-- O halo é a incerteza que deu o GPS, á escala do mapa: este SI
                 medra ao achegarse, porque son metros de verdade. -->
            <circle
              v-if="c.radio / zoom > 2" class="chincheta__halo"
              :cx="c.x" :cy="c.y" :r="c.radio"
            />
            <circle
              class="chincheta__punto" :cx="c.x" :cy="c.y"
              :r="(seleccionada === c.slug ? 21 : 15) * zoom"
              :stroke-width="3.5 * zoom"
            />
          </g>
        </g>
      </svg>

      <!-- Mini ficha sobre o mapa. Estaba debaixo, nunha liña de texto, e con
           mapa e listaxe arredor case non se vía que algo cambiara ao premer:
           quen preme unha chincheta quere a resposta onde está a mirar. -->
      <Transition name="ficha">
        <div v-if="detalle" class="ficha" role="status">
          <NuxtLink :to="`/especie/${detalle.slug}`" class="ficha__ir">
            <img
              v-if="detalle.especie.foto" :src="detalle.especie.foto.mini"
              :alt="detalle.nome" class="ficha__foto"
              :style="{ objectPosition: encadre(detalle.especie.foto) }"
              width="64" height="64" decoding="async"
            >
            <span v-else class="ficha__foto ficha__foto--baleira" aria-hidden="true">
              <IconaPluma />
            </span>

            <span class="ficha__texto">
              <span class="ficha__nome">{{ detalle.nome }}</span>
              <span class="ficha__sci">{{ detalle.especie.cientifico }}</span>
              <span class="ficha__data">Marcada o {{ dataLexible(detalle.data) }}</span>
            </span>
          </NuxtLink>

          <button class="ficha__pechar" aria-label="Pechar" @click="pecha">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Só as provincias nas que hai algo: ofrecer as catro sempre sería dar
         tres botóns que levan a un mapa baleiro. E «As miñas marcas» primeiro,
         que é o encadre co que se abre e ao que se quere volver. -->
    <div class="onde" role="group" aria-label="Que parte do mapa">
      <button
        class="onde__botón" :class="{ 'onde__botón--posto': foco.tipo === 'marcas' }"
        :aria-pressed="foco.tipo === 'marcas'" @click="amosa({ tipo: 'marcas' })"
      >
        As miñas marcas
      </button>
      <button
        v-for="[nome, n] in provinciasConMarcas" :key="nome"
        class="onde__botón" :class="{ 'onde__botón--posto': foco.tipo === 'provincia' && provincia === nome }"
        :aria-pressed="foco.tipo === 'provincia' && provincia === nome"
        @click="amosa({ tipo: 'provincia', nome })"
      >
        {{ nome }} <span class="onde__conta">{{ n }}</span>
      </button>
      <button
        class="onde__botón" :class="{ 'onde__botón--posto': foco.tipo === 'galicia' }"
        :aria-pressed="foco.tipo === 'galicia'" @click="amosa({ tipo: 'galicia' })"
      >
        Toda Galicia
      </button>
    </div>

    <figcaption class="mapa__pé">
      <span v-if="foco.tipo === 'comarca'" class="mapa__onde">{{ foco.zona.nome }} ·</span>
      {{ dentro.length }} {{ dentro.length === 1 ? 'marca' : 'marcas' }} con sitio.
      Preme nunha para saber cal é, ou na terra para achegarte.
      <span v-if="[...grupos.values()].some(n => n > 1)" class="mapa__aviso">
        Hai marcas superpostas: achégate para separalas.
      </span>
      <span v-if="fóra.length" class="mapa__aviso">
        {{ fóra.length }} {{ fóra.length === 1 ? 'marca queda' : 'marcas quedan' }}
        fóra de Galicia e non {{ fóra.length === 1 ? 'se ve' : 'se ven' }} aquí.
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.mapa {
  margin: 0 0 var(--oco);
}

/* O lenzo e a tarxeta xuntos: a tarxeta ponse enriba do mapa e non enriba dos
   botóns nin do pé. */
.mapa__caixa {
  position: relative;
}

.mapa__lenzo {
  display: block;
  width: 100%;
  height: auto;
  /* Que non se estire nunha pantalla ancha: o mapa non gaña nada por ser
     enorme e a listaxe é o que se vén ver. */
  max-height: 60vh;
}

.mapa__terra path {
  fill: color-mix(in srgb, var(--fento) 16%, transparent);
  stroke: color-mix(in srgb, var(--fento) 40%, transparent);
  stroke-width: 1;
  stroke-linejoin: round;
  cursor: pointer;
  transition: fill var(--saída);
}

.mapa__terra path:hover {
  fill: color-mix(in srgb, var(--fento) 26%, transparent);
}

/* As comarcas doutras provincias non se agochan ao achegarse: seguen aí, máis
   apagadas. Recortalas deixaría un bordo flotando no baleiro e custaría saber
   que parte de Galicia se está a ver. */
.mapa__fóra {
  fill: color-mix(in srgb, var(--fento) 7%, transparent);
}

.refs {
  pointer-events: none;
}

.refs__punto {
  fill: color-mix(in srgb, var(--fento) 55%, transparent);
}

.refs__nome {
  fill: var(--tinta-suave);
  font-family: inherit;
  /* Aro do mesmo cor do mapa arredor das letras: sen el, un nome que caia
     sobre o bordo dunha comarca non se le. */
  paint-order: stroke;
  stroke: var(--papel);
  stroke-width: 3px;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
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
}

.chincheta:hover .chincheta__punto {
  fill: color-mix(in srgb, var(--papo) 80%, var(--tinta));
}

/* Escollida: cámbiaselle o bordo, non só o tamaño. Sen isto a única pista de
   cal se premeu era o anel de foco que pinta o navegador, que nin sequera sae
   sempre —depende de se se chegou co dedo ou co tabulador. */
.chincheta--posta .chincheta__punto {
  stroke: var(--tinta);
}

/* O foco vai no punto e non nun rectángulo arredor do grupo, que co halo
   quedaría enorme e desprazado. */
.chincheta:focus {
  outline: none;
}

.chincheta:focus-visible .chincheta__punto {
  stroke: var(--foco);
}

/* Ancorada abaixo e non onde está a chincheta: cunha tarxeta que segue ao
   punto, as marcas do bordo do mapa deixaríana medio fóra da pantalla, e nun
   móbil estreito non hai sitio para movela a ningures. Abaixo está sempre
   enteira e sempre no mesmo sitio, que ademais é onde chega o polgar. */
.ficha {
  position: absolute;
  left: 0.4rem;
  right: 0.4rem;
  bottom: 0.4rem;
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  padding: 0.4rem;
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  background: var(--papel);
  box-shadow: var(--sombra-alta);
}

.ficha__ir {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  color: inherit;
  text-decoration: none;
  border-radius: calc(var(--raio) - 2px);
}

.ficha__ir:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.ficha__foto {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: calc(var(--raio) - 3px);
  object-fit: cover;
  background: var(--bretema);
}

.ficha__foto--baleira {
  display: grid;
  place-items: center;
  color: var(--fento-claro);
}

.ficha__foto--baleira :deep(svg) {
  width: 26px;
  height: 26px;
}

.ficha__texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.05rem;
}

.ficha__nome {
  font-family: var(--fonte-titulo);
  font-size: 1.02rem;
  font-weight: 650;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ficha__sci {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--tinta-suave);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ficha__data {
  margin-top: 0.15rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--fento);
}

.ficha__pechar {
  display: grid;
  place-items: center;
  width: 34px;
  flex: none;
  align-self: flex-start;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--tinta-suave);
  cursor: pointer;
}

.ficha__pechar:hover {
  background: var(--bretema);
  color: var(--tinta);
}

.ficha__pechar:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.ficha__pechar svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.ficha-enter-active,
.ficha-leave-active {
  transition: opacity var(--entrada), transform var(--entrada);
}

.ficha-enter-from,
.ficha-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .ficha-enter-from,
  .ficha-leave-to {
    transform: none;
  }
}

/* Os mesmos botóns segmentados que a duración en «Escoitar»: aquí tamén son
   poucas opcións e excluíntes. */
.onde {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.6rem;
}

.onde__botón {
  min-height: 34px;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: var(--papel);
  color: var(--tinta-suave);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--saída), border-color var(--saída);
}

.onde__botón:hover {
  border-color: var(--fento-claro);
  color: var(--fento);
}

.onde__botón:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.onde__botón--posto {
  background: var(--fento-tenue);
  border-color: color-mix(in srgb, var(--fento) 45%, transparent);
  color: var(--fento);
}

.onde__conta {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
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

.mapa__onde {
  color: var(--tinta);
  font-weight: 650;
}

.mapa__aviso {
  flex-basis: 100%;
}
</style>
