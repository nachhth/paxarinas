<script setup lang="ts">
import type { Canto } from '~/types/catalogo'

const props = defineProps<{ canto: Canto, especie: string }>()

/**
 * Termos concretos, en inglés, tal e como os etiqueta quen grava en xeno-canto.
 * Só están os que din algo que a praza non diga xa: que un `song` é un canto xa
 * o sabemos por estar na praza do canto.
 */
const MATICES: Record<string, string> = {
  'alarm call': 'Reclamo de alarma',
  'flight call': 'Reclamo en voo',
  'begging call': 'Reclamo de pedinchada',
  'nocturnal flight call': 'Reclamo nocturno',
  drumming: 'Tamborileo',
  subsong: 'Canto en baixo',
}

const XENERICO: Record<string, string> = { canto: 'Canto', reclamo: 'Reclamo' }

/**
 * Como se lle chama a esta gravación.
 *
 * O campo `tipo` é texto libre e vén moitas veces en lista ("alarm call,
 * call"), así que non se pode buscar tal cal nun mapa: antes saía en inglés e
 * con comas na ficha. Pártese, e se algún termo engade matiz úsase ese; se non,
 * abonda co nome da praza.
 */
const etiqueta = computed(() => {
  const termos = (props.canto.tipo ?? '')
    .toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
  for (const t of termos) {
    if (MATICES[t]) return MATICES[t]
  }
  return XENERICO[props.canto.praza] ?? 'Gravación'
})

/** Que se oe niso, en dúas palabras. */
const PE: Record<string, string> = {
  canto: 'o que identifica a especie',
  reclamo: 'o que máis se oe',
}

/**
 * Só a comarca ou concello, non o enderezo enteiro.
 *
 * `lugar` vén de xeno-canto e é longo de máis para un botón: «Terra de Lemos
 * (near Rosende), Lugo, Galicia». O primeiro tramo abonda para saber se a
 * gravación é de aquí, que é o que importa —hai subespecies con voces
 * distintas—, e o enderezo completo segue no `title` e na atribución.
 */
const onde = computed(() => {
  const l = props.canto.lugar
  if (!l) return null
  return l.split(',')[0]!.replace(/\s*\(.*?\)\s*/g, ' ').trim()
})

/**
 * Reprodución propia en vez dos controis nativos.
 *
 * O que se gaña: o botón énchese de cor ao ritmo do son, así que se ve canto
 * queda sen ler números, e as dúas gravacións quedan iguais e do tamaño do dedo.
 *
 * O que se perde, e convén sabelo: os controis nativos traen barra de busca e
 * volume de serie. Para clips de 15 segundos non paga a pena mantelos, pero por
 * iso o botón segue sendo un `<button>` de verdade —responde ao espazo e ao
 * intro— e di en voz alta se está a soar ou parado.
 */
const audio = useTemplateRef<HTMLAudioElement>('audio')
const soando = ref(false)
/** De 0 a 1. Move o recheo do botón. */
const avance = ref(0)
let fotograma: number | null = null

/**
 * Canto dura o clip, de verdade.
 *
 * `audio.duration` NON serve tal cal: nun Ogg/Opus sen a duración nos metadatos
 * —que é o que produce ffmpeg ao recortar— Chromium devolve `Infinity` ata ter
 * o ficheiro enteiro. E `currentTime / Infinity` é cero, así que o recheo
 * quedaba parado no sitio mentres o son avanzaba.
 *
 * Por orde: a duración se é un número real; se non, o final do tramo
 * navegable, que xa se sabe en canto hai buffer; e como último recurso os 15 s
 * a que recorta `etl/xenocanto_cantos.py` (`DURACION`), que é o tope de todos
 * os clips.
 */
function dura(a: HTMLAudioElement) {
  if (Number.isFinite(a.duration) && a.duration > 0) return a.duration
  try {
    if (a.seekable.length) {
      const fin = a.seekable.end(a.seekable.length - 1)
      if (Number.isFinite(fin) && fin > 0) return fin
    }
  } catch { /* `end()` tira se o tramo desapareceu */ }
  return 15
}

function segue() {
  const a = audio.value
  if (!a) return
  avance.value = Math.min(1, a.currentTime / dura(a))
  fotograma = requestAnimationFrame(segue)
}

function para() {
  if (fotograma !== null) { cancelAnimationFrame(fotograma); fotograma = null }
}

async function alterna() {
  const a = audio.value
  if (!a) return

  if (soando.value) {
    a.pause()
    return
  }

  // Un son á vez: se non, ao premer o reclamo co canto soando escóitanse os dous
  // á vez e non se distingue ningún. Párase todo o demais da páxina, que é o
  // único xeito de coordinar dous compoñentes irmáns sen estado compartido.
  for (const outro of document.querySelectorAll('audio')) {
    if (outro !== a) outro.pause()
  }

  try {
    await a.play()
  } catch {
    // Un `play()` rexeitado (política de autoplay, ficheiro que non chegou) non
    // deixa o botón mentindo: o estado vén dos eventos do propio elemento.
  }
}

function aoTocar() { soando.value = true; segue() }
function aoParar() { soando.value = false; para() }
function aoRematar() { soando.value = false; para(); avance.value = 0 }

onUnmounted(para)
</script>

<template>
  <div class="son">
    <button
      class="son__boton" :class="{ 'son__boton--soando': soando }"
      :style="{ '--avance': avance }"
      :aria-label="`${etiqueta} de ${especie}${soando ? ', a soar' : ''}`"
      :title="canto.lugar ?? undefined"
      @click="alterna"
    >
      <!-- O recheo vai por detrás do texto e crece co son. `scaleX` e non
           `width`: anímase na GPU e non forza cálculo de disposición 60 veces
           por segundo. -->
      <span class="son__recheo" aria-hidden="true" />

      <span class="son__icona" aria-hidden="true">
        <svg v-if="!soando" viewBox="0 0 24 24">
          <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
        </svg>
        <svg v-else viewBox="0 0 24 24"><path d="M7 6h3v12H7zM14 6h3v12h-3z" /></svg>
      </span>

      <span class="son__texto">
        <span class="son__nome">{{ etiqueta }}</span>
        <span class="son__pe">
          <template v-if="onde">{{ onde }}</template>
          <template v-else>{{ PE[canto.praza] ?? '' }}</template>
        </span>
      </span>
    </button>

    <audio
      ref="audio" class="só-lectores" preload="none" :src="canto.ficheiro"
      @play="aoTocar" @pause="aoParar" @ended="aoRematar"
    />

    <!-- A autoría vai por gravación e non nunha liña común ao pé: as licenzas
         CC BY esixen nomear a quen gravou, e cada clip ten o seu autor. -->
    <p class="son__credito">
      <span v-if="canto.autor">{{ canto.autor }}</span>
      <template v-if="ligazon(canto.licenza)">
        · <a :href="ligazon(canto.licenza)!" rel="license">licenza</a>
      </template>
      <template v-if="ligazon(canto.orixe)">
        · <a :href="ligazon(canto.orixe)!">xeno-canto</a>
      </template>
    </p>
  </div>
</template>

<style scoped>
/* O elemento da rexilla é este, non o botón: hai que pasarlle o alto ao botón,
   que se non o do lugar curto quedaba máis baixo ca o do lado.
   Estirar `.son` non abondaba: o crédito de abaixo mide unha ou dúas liñas
   segundo o longo do nome de quen gravou, e esa diferenza saíalle do botón.
   Con `subgrid` o botón e o crédito de cada gravación entran nas filas do pai
   (`.sons`), así que os dous botóns comparten fila e miden igual. */
.son {
  display: grid;
  grid-row: span 2;
  grid-template-rows: subgrid;
}

/* Onde non haxa `subgrid` —navegadores anteriores a 2023— vólvese ao de antes:
   botóns do mesmo alto de fila e a diferenza do crédito repartida. Peor, pero
   nada rompe. */
@supports not (grid-template-rows: subgrid) {
  .son {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}

.son__boton {
  flex: 1;
  position: relative;
  overflow: hidden;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 60px;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--fento);
  border-radius: var(--raio);
  background: var(--papel);
  color: var(--fento);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--saída);
}

/* O fondo do hover ten que ser MÁIS CLARO que o recheo, non igual.
   Antes os dous eran `--fento-tenue`: ao premer, o botón quedaba con foco e
   hover, todo do mesmo ton, e o avance non se vía. */
.son__boton:hover {
  background: color-mix(in srgb, var(--fento) 7%, var(--papel));
}

.son__boton:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

/* O recheo que avanza co son. Vai detrás de todo (`z-index: 0` co contido en 1)
   e non tapa o texto: é un fondo, non unha barra. */
.son__recheo {
  position: absolute;
  inset: 0;
  transform: scaleX(var(--avance, 0));
  transform-origin: left center;
  /* Máis forte que calquera fondo do botón (nin hover nin foco chegan aquí),
     que é o que fai que o avance se vexa mentres soa. */
  background: color-mix(in srgb, var(--fento) 26%, var(--papel));
  z-index: 0;
}

.son__icona,
.son__texto {
  position: relative;
  z-index: 1;
}

.son__icona {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
}

.son__icona svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

/* O de parar é macizo: unha icona de pausa con só trazo léase peor a este
   tamaño. */
.son__boton--soando .son__icona svg {
  fill: currentColor;
  stroke: none;
}

.son__texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.son__nome {
  font-family: var(--fonte-titulo);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.son__pe {
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--tinta-suave);
  /* Dobra ata dúas liñas e corta aí. Nunha soa liña con puntos perdíase o nome
     do sitio case enteiro, e sen tope un topónimo longo facía o botón o dobre
     de alto ca o seu compañeiro. O enderezo completo segue no `title`. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Un nome sen espazos e máis longo ca a columna tamén ten que partir. */
  overflow-wrap: anywhere;
}

.son__credito {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  line-height: 1.45;
  color: var(--tinta-suave);
}
</style>
