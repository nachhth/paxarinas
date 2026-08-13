<script setup lang="ts">
import type { FotoGaleria } from '~/types/catalogo'

const props = defineProps<{ slug: string; nome: string }>()

/**
 * A galería é a única parte da app que precisa conexión. Non se carga soa:
 * hai que premer. Así só se lle pide tráfico a Wikimedia cando alguén quere
 * ver máis dun paxaro concreto, e non en cada visita a unha ficha.
 */
const estado = ref<'agochada' | 'cargando' | 'lista' | 'baleira' | 'erro'>('agochada')
const fotos = ref<FotoGaleria[]>([])

async function amosar() {
  if (estado.value === 'cargando' || estado.value === 'lista') return
  estado.value = 'cargando'
  try {
    const r = await fetch(`/data/galeria/${props.slug}.json`)
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    fotos.value = d.fotos ?? []
    estado.value = fotos.value.length ? 'lista' : 'baleira'
  } catch {
    estado.value = 'erro'
  }
}

/**
 * Visor. Premer nunha foto amplíaa aquí mesmo en vez de sacarte da app: quen
 * está a comparar plumaxes non quere marchar a Commons e volver. A ligazón á
 * páxina orixinal queda debaixo, que é onde importa para os créditos.
 */
const aberta = ref<number | null>(null)

const foto = computed(() =>
  aberta.value === null ? null : fotos.value[aberta.value] ?? null)

function abre(i: number) {
  aberta.value = i
}

function pecha() {
  aberta.value = null
}

function move(paso: number) {
  if (aberta.value === null || !fotos.value.length) return
  const n = fotos.value.length
  aberta.value = (aberta.value + paso + n) % n
}

function tecla(e: KeyboardEvent) {
  if (aberta.value === null) return
  if (e.key === 'Escape') pecha()
  else if (e.key === 'ArrowRight') move(1)
  else if (e.key === 'ArrowLeft') move(-1)
}

onMounted(() => window.addEventListener('keydown', tecla))
onBeforeUnmount(() => window.removeEventListener('keydown', tecla))

// Co visor aberto, o fondo non se move: se non, ao pechar quedas noutro sitio.
watch(aberta, (v) => {
  document.body.style.overflow = v === null ? '' : 'hidden'
})
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<template>
  <div>
    <template v-if="estado === 'agochada'">
      <button class="boton boton--suave" @click="amosar">
        Ver máis fotos
      </button>
      <p class="nota">Cárganse desde Commons, así que precisan conexión.</p>
    </template>

    <!-- Mentres chega o JSON, o oco que van ocupar as fotos. Antes era a
         palabra "Cargando…" e a ficha daba un salto ao aparecer a grella. -->
    <div v-else-if="estado === 'cargando'" class="cargando">
      <ul class="grella" aria-hidden="true">
        <li v-for="i in 6" :key="i">
          <div class="esqueleto oco-foto" />
        </li>
      </ul>
      <p class="nota" role="status">Buscando fotos en Commons…</p>
    </div>

    <p v-else-if="estado === 'baleira'" class="baleiro">
      Non hai máis fotos desta especie en Commons.
      <span class="baleiro__pista">
        A que se ve arriba é a única que ten ficha.
      </span>
    </p>

    <p v-else-if="estado === 'erro'" class="baleiro baleiro--erro">
      Non se puideron cargar.
      <span class="baleiro__pista">
        Estas fotos non se gardan no dispositivo: precisan conexión.
      </span>
      <button class="boton boton--suave" @click="amosar">Tentar de novo</button>
    </p>

    <template v-else>
      <ul class="grella">
        <li v-for="(f, i) in fotos" :key="f.url" :style="{ '--i': i }">
          <button type="button" class="lupa" @click="abre(i)">
            <img
              :src="f.url"
              :alt="`${nome} — fotografía de ${f.autor ?? 'autoría descoñecida'}`"
              loading="lazy"
              decoding="async"
            >
            <span class="só-lectores">Ampliar</span>
          </button>
          <p class="credito">
            <span v-if="f.autor">{{ f.autor }}</span>
            <template v-if="f.licenzaUrl">
              · <a :href="f.licenzaUrl" rel="license">{{ f.licenza }}</a>
            </template>
            <span v-else-if="f.licenza"> · {{ f.licenza }}</span>
          </p>
        </li>
      </ul>
      <p class="nota">
        Fotos aloxadas en
        <a href="https://commons.wikimedia.org">Wikimedia Commons</a>. Non se
        gardan no dispositivo: só se ven con conexión.
      </p>
    </template>

    <Teleport to="body">
      <div
        v-if="foto" class="visor" role="dialog" aria-modal="true"
        :aria-label="`Foto de ${nome}`" @click.self="pecha"
      >
        <button class="visor__pechar" aria-label="Pechar" @click="pecha">✕</button>

        <button
          v-if="fotos.length > 1" class="visor__frecha visor__frecha--esq"
          aria-label="Anterior" @click="move(-1)"
        >‹</button>

        <figure class="visor__marco" @click.self="pecha">
          <img
            :src="foto.urlGrande ?? foto.url"
            :alt="`${nome} — fotografía de ${foto.autor ?? 'autoría descoñecida'}`"
          >
          <figcaption>
            <span v-if="foto.autor">{{ foto.autor }}</span>
            <template v-if="foto.licenzaUrl">
              · <a :href="foto.licenzaUrl" rel="license">{{ foto.licenza }}</a>
            </template>
            <span v-else-if="foto.licenza"> · {{ foto.licenza }}</span>
            <a v-if="foto.orixe" class="visor__orixe" :href="foto.orixe">
              Ver en Wikimedia Commons ↗
            </a>
          </figcaption>
        </figure>

        <button
          v-if="fotos.length > 1" class="visor__frecha visor__frecha--dta"
          aria-label="Seguinte" @click="move(1)"
        >›</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* `.boton`, `.nota` e `.baleiro` veñen de base.css. */

.cargando .grella {
  margin-bottom: 0.4rem;
}

.oco-foto {
  aspect-ratio: 4 / 3;
}

.baleiro {
  padding: 1.5rem 1rem;
}

.baleiro--erro::before {
  content: '📡';
}

.baleiro .boton {
  margin-top: 0.5rem;
}

.grella {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
}

/* A grella entra escalonada: 40 ms por foto, que abonda para que se lea como
   unha chegada e non como un parpadeo. Só opacidade e desprazamento. */
.grella li {
  animation: aparece 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 40ms);
}

@keyframes aparece {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* Botón e non ligazón: amplía aquí mesmo. A ligazón a Commons vai no visor. */
.lupa {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  border-radius: var(--raio);
  overflow: hidden;
  cursor: zoom-in;
}

.lupa:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.grella img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--bretema);
  border-radius: var(--raio);
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow var(--saída);
}

.lupa:hover img {
  transform: scale(1.04);
  box-shadow: var(--sombra-alta);
}

.credito {
  margin: 0.25rem 0 0;
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--tinta-suave);
}

.nota {
  margin: 0.6rem 0 0;
}

/* Visor a pantalla completa. Vai por `Teleport` ao body para que non o recorte
   ningún `overflow` da ficha. */
.visor {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  background: rgb(0 0 0 / 88%);
  animation: entra-visor 180ms ease-out;
}

@keyframes entra-visor {
  from { opacity: 0; }
}

.visor__marco {
  margin: 0;
  max-width: min(100%, 60rem);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: center;
}

.visor__marco img {
  display: block;
  max-width: 100%;
  /* Deixa sitio para o pé: sen isto a autoría queda fóra da pantalla no móbil. */
  max-height: calc(100dvh - 9rem);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--raio);
}

.visor__marco figcaption {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.35rem 0.75rem;
  max-width: 40rem;
  text-align: center;
  font-size: 0.8rem;
  color: #d8dbd4;
}

.visor__marco figcaption a {
  color: #fff;
}

.visor__orixe {
  flex-basis: 100%;
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.visor__pechar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2.75rem;
  height: 2.75rem;
  font-size: 1.2rem;
  color: #fff;
  background: rgb(255 255 255 / 12%);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.visor__frecha {
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  font-size: 2rem;
  line-height: 1;
  color: #fff;
  background: rgb(255 255 255 / 12%);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.visor__pechar:hover,
.visor__frecha:hover {
  background: rgb(255 255 255 / 22%);
}

.visor__pechar:focus-visible,
.visor__frecha:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* En móbil as frechas taparían a foto: baixan a unha barra ao pé. */
@media (max-width: 34rem) {
  .visor {
    flex-wrap: wrap;
  }

  .visor__marco {
    order: -1;
    flex-basis: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lupa:hover img {
    transform: none;
  }

  .visor {
    animation: none;
  }
}
</style>
