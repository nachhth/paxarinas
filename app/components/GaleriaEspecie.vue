<script setup lang="ts">
import type { FotoGaleria, Galeria, Plumaxe } from '~/types/catalogo'

const props = defineProps<{ slug: string; nome: string }>()

/**
 * A galería é a única parte da app que precisa conexión. Non se carga soa:
 * hai que premer. Así só se lle pide tráfico a Wikimedia cando alguén quere
 * ver máis dun paxaro concreto, e non en cada visita a unha ficha.
 */
const estado = ref<'agochada' | 'cargando' | 'lista' | 'baleira' | 'erro'>('agochada')
const fotos = ref<FotoGaleria[]>([])
const grupos = ref<Plumaxe[]>([])

async function amosar() {
  if (estado.value === 'cargando' || estado.value === 'lista') return
  estado.value = 'cargando'
  try {
    const r = await fetch(`/data/galeria/${props.slug}.json`)
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json() as Galeria
    fotos.value = d.fotos ?? []
    grupos.value = d.grupos ?? []
    estado.value = fotos.value.length ? 'lista' : 'baleira'
  } catch {
    estado.value = 'erro'
  }
}

/**
 * Agrupar por plumaxe é o que máis achega isto a identificar de verdade: en
 * moitas aves —calquera pato— o macho e a femia non se parecen en nada, así
 * que unha soa foto pode ser xusto a que a persoa non viu.
 *
 * `grupos` chega baleiro na maioría das especies, e entón isto queda coma
 * sempre. O ETL só o enche cando hai polo menos dous grupos con dúas fotos
 * cada un, e nunca un sexo sen o outro: o que informa non é a etiqueta
 * «Macho», é poder comparala coa de «Femia».
 */
const NOMES: Record<Plumaxe, string> = {
  macho: 'Macho',
  femia: 'Femia',
  xuvenil: 'Xuvenil',
  eclipse: 'Plumaxe de eclipse',
  nupcial: 'Plumaxe nupcial',
  inverno: 'Plumaxe de inverno',
}

interface Seccion { clave: string; nome: string; fotos: FotoGaleria[] }

const seccions = computed<Seccion[]>(() => {
  if (!grupos.value.length) {
    return [{ clave: 'todas', nome: '', fotos: fotos.value }]
  }
  const out: Seccion[] = grupos.value
    .map(g => ({ clave: g as string, nome: NOMES[g], fotos: fotos.value.filter(f => f.plumaxe === g) }))
    .filter(s => s.fotos.length)
  // As que non se puideron clasificar van ao final e con nome propio, non
  // metidas nun grupo calquera: non saber non é o mesmo que saber que non.
  const resto = fotos.value.filter(f => !f.plumaxe)
  if (resto.length) out.push({ clave: 'outras', nome: 'Sen clasificar', fotos: resto })
  return out
})

// O visor percorre as fotos na mesma orde na que se ven, non na do ficheiro:
// se non, a frecha «seguinte» saltaría de grupo sen motivo aparente.
const ordenadas = computed(() => seccions.value.flatMap(s => s.fotos))
const indice = computed(() => new Map(ordenadas.value.map((f, i) => [f, i])))

function etiqueta(f: FotoGaleria) {
  return f.plumaxe ? NOMES[f.plumaxe] : null
}

/**
 * Visor. Premer nunha foto amplíaa aquí mesmo en vez de sacarte da app: quen
 * está a comparar plumaxes non quere marchar a Commons e volver. A ligazón á
 * páxina orixinal queda debaixo, que é onde importa para os créditos.
 */
const aberta = ref<number | null>(null)

const foto = computed(() =>
  aberta.value === null ? null : ordenadas.value[aberta.value] ?? null)

function abre(i: number) {
  aberta.value = i
}

function pecha() {
  aberta.value = null
}

function move(paso: number) {
  if (aberta.value === null || !ordenadas.value.length) return
  const n = ordenadas.value.length
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
      <section v-for="s in seccions" :key="s.clave" class="seccion">
        <h3 v-if="s.nome" class="seccion__titulo">{{ s.nome }}</h3>
        <ul class="grella">
          <li v-for="(f, i) in s.fotos" :key="f.url" :style="{ '--i': i }">
            <button type="button" class="lupa" @click="abre(indice.get(f) ?? 0)">
              <!-- `referrerpolicy`: estas son as únicas imaxes da app que se
                   piden a un terceiro. Sen isto, Commons recibe a URL completa
                   da ficha e sabe que paxaro está a mirar cada quen. -->
              <img
                :src="f.url"
                :alt="`${nome}${etiqueta(f) ? ` (${etiqueta(f)?.toLowerCase()})` : ''} — fotografía de ${f.autor ?? 'autoría descoñecida'}`"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
              >
              <span class="só-lectores">Ampliar</span>
            </button>
            <p class="credito">
              <span v-if="f.autor">{{ f.autor }}</span>
              <!-- `ligazon` porque a URL da licenza vén de Commons e edítaa
                   calquera: se non é http(s) queda o nome da licenza en texto,
                   que é o que esixe a atribución, pero sen enlace. -->
              <template v-if="ligazon(f.licenzaUrl)">
                · <a :href="ligazon(f.licenzaUrl)!" rel="license">{{ f.licenza }}</a>
              </template>
              <span v-else-if="f.licenza"> · {{ f.licenza }}</span>
            </p>
          </li>
        </ul>
      </section>

      <!-- De onde saen os grupos. Isto non é un dato de campo revisado: son as
           etiquetas que puxo quen subiu cada foto a Commons, e por iso se di. -->
      <p v-if="grupos.length" class="nota">
        Os grupos veñen de como están clasificadas as fotos en Commons. As que
        van en «Sen clasificar» poden ser de calquera plumaxe: non hai dato,
        non que sexan doutra cousa.
      </p>
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
          v-if="ordenadas.length > 1" class="visor__frecha visor__frecha--esq"
          aria-label="Anterior" @click="move(-1)"
        >‹</button>

        <figure class="visor__marco" @click.self="pecha">
          <img
            :src="foto.urlGrande ?? foto.url"
            :alt="`${nome}${etiqueta(foto) ? ` (${etiqueta(foto)?.toLowerCase()})` : ''} — fotografía de ${foto.autor ?? 'autoría descoñecida'}`"
            referrerpolicy="no-referrer"
          >
          <figcaption>
            <strong v-if="etiqueta(foto)" class="visor__plumaxe">
              {{ etiqueta(foto) }}
            </strong>
            <span v-if="foto.autor">{{ foto.autor }}</span>
            <template v-if="ligazon(foto.licenzaUrl)">
              · <a :href="ligazon(foto.licenzaUrl)!" rel="license">{{ foto.licenza }}</a>
            </template>
            <span v-else-if="foto.licenza"> · {{ foto.licenza }}</span>
            <a v-if="ligazon(foto.orixe)" class="visor__orixe" :href="ligazon(foto.orixe)!">
              Ver en Wikimedia Commons ↗
            </a>
          </figcaption>
        </figure>

        <button
          v-if="ordenadas.length > 1" class="visor__frecha visor__frecha--dta"
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

/* Os grupos van seguidos e sen caixa: o que separa é o título, e abonda.
   Unha tarxeta por grupo faría parecer que son tres galerías distintas. */
.seccion + .seccion {
  margin-top: 1.1rem;
}

.seccion__titulo {
  margin: 0 0 0.45rem;
  font-size: 0.9rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tinta-suave);
}

.visor__plumaxe {
  flex-basis: 100%;
  color: #fff;
  font-size: 0.95rem;
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
