<script setup lang="ts">
import type { SeccionFicha } from '~/composables/useOrdeSeccions'
import { NOMES_SECCION, useOrdeSeccions } from '~/composables/useOrdeSeccions'

/**
 * Reordenar as seccións da ficha.
 *
 * Arrástrase co dedo ou co rato, e tamén se move con dous botóns. Non son dous
 * xeitos de facer o mesmo por gusto: **arrastrar non existe co teclado nin cun
 * lector de pantalla**, así que sen os botóns esta función quedaría só para
 * quen pode apuntar e manter premido.
 *
 * O arrastre vai con eventos de punteiro e non cunha librería. `vuedraggable`
 * son uns 45 kB que entrarían no precache do service worker —e polo tanto na
 * instalación de todo o mundo— por unha preferencia que moita xente non vai
 * tocar. Aquí abondan trinta liñas.
 */
const { orde, tocada, move, colocaEn, garda, restaura } = useOrdeSeccions()

const arrastrando = ref<SeccionFicha | null>(null)
const lista = useTemplateRef<HTMLElement>('lista')

function empeza(id: SeccionFicha, ev: PointerEvent) {
  arrastrando.value = id
  // Captura: se non, ao saír o dedo do elemento pérdense os `pointermove` e a
  // fila quédase pegada ao punteiro sen soltarse nunca.
  ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
}

/**
 * Sobre que fila está o punteiro. Mírase a posición real de cada fila en vez de
 * calcular con alturas fixas: as filas non miden todas igual (hai nomes de
 * sección que ocupan dúas liñas en móbil).
 */
function move_(ev: PointerEvent) {
  if (!arrastrando.value || !lista.value) return
  const filas = [...lista.value.querySelectorAll<HTMLElement>('[data-id]')]
  const destino = filas.findIndex((f) => {
    const c = f.getBoundingClientRect()
    return ev.clientY >= c.top && ev.clientY <= c.bottom
  })
  if (destino >= 0) colocaEn(arrastrando.value, destino)
}

function remata() {
  if (!arrastrando.value) return
  arrastrando.value = null
  // Gárdase ao soltar e non en cada movemento: durante un arrastre isto
  // dispararíase decenas de veces contra `localStorage`.
  garda()
}
</script>

<template>
  <div class="ordenar">
    <p class="ordenar__pe">
      Arrastra co dedo ou usa as frechas. A orde gárdase neste dispositivo e
      vale para todas as fichas.
    </p>

    <ul ref="lista" class="ordenar__lista">
      <li
        v-for="(id, i) in orde" :key="id"
        :data-id="id"
        class="fila"
        :class="{ 'fila--activa': arrastrando === id }"
      >
        <button
          class="fila__agarre"
          :aria-label="`Arrastrar ${NOMES_SECCION[id]}`"
          @pointerdown="empeza(id, $event)"
          @pointermove="move_"
          @pointerup="remata"
          @pointercancel="remata"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 9h14M5 15h14" />
          </svg>
        </button>

        <span class="fila__nome">{{ NOMES_SECCION[id] }}</span>

        <span class="fila__frechas">
          <button
            class="fila__frecha" :disabled="i === 0"
            :aria-label="`Subir ${NOMES_SECCION[id]}`"
            @click="move(id, -1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
          </button>
          <button
            class="fila__frecha" :disabled="i === orde.length - 1"
            :aria-label="`Baixar ${NOMES_SECCION[id]}`"
            @click="move(id, 1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </span>
      </li>
    </ul>

    <button v-if="tocada" class="ligazon" @click="restaura">
      Volver á orde de sempre
    </button>
  </div>
</template>

<style scoped>
.ordenar__pe {
  margin: 0 0 0.7rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.ordenar__lista {
  list-style: none;
  margin: 0 0 0.6rem;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.fila {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem 0.3rem 0.2rem;
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  background: var(--papel);
  /* Sen isto, arrastrar cara abaixo despraza a páxina en vez de mover a fila. */
  touch-action: none;
}

.fila--activa {
  border-color: var(--fento);
  background: var(--fento-tenue);
  box-shadow: var(--sombra-alta);
}

.fila__nome {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
}

.fila__agarre,
.fila__frecha {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border: none;
  background: none;
  color: var(--tinta-suave);
  cursor: pointer;
  border-radius: var(--raio-p);
}

.fila__agarre {
  cursor: grab;
}

.fila--activa .fila__agarre {
  cursor: grabbing;
}

.fila__frecha:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.fila__frecha:not(:disabled):hover {
  background: var(--fento-tenue);
  color: var(--fento);
}

.fila__agarre:focus-visible,
.fila__frecha:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: -2px;
}

.fila__frechas {
  display: flex;
  flex: none;
}

.fila__agarre svg,
.fila__frecha svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
