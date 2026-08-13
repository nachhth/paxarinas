<script setup lang="ts">
import type { Canto } from '~/types/catalogo'

const props = defineProps<{ canto: Canto; especie: string }>()

/**
 * Termos concretos, en inglés, tal e como os etiqueta quen grava en xeno-canto.
 * Só están os que din algo que a praza non diga xa: que un `song` é un canto xa
 * o sabemos por estar na praza do canto.
 */
const MATICES: Record<string, string> = {
  'alarm call': 'reclamo de alarma',
  'flight call': 'reclamo en voo',
  'begging call': 'reclamo de pedinchada',
  'nocturnal flight call': 'reclamo nocturno',
  drumming: 'tamborileo',
  subsong: 'canto en baixo',
}

const XENERICO: Record<string, string> = { canto: 'canto', reclamo: 'reclamo' }

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
  return XENERICO[props.canto.praza] ?? 'gravación'
})
</script>

<template>
  <div>
    <p class="tipo">{{ etiqueta }}</p>

    <!-- Controis nativos a propósito: son accesibles de serie e non hai que
         manter unha barra de progreso propia para 15 segundos de audio. -->
    <audio
      class="reprodutor"
      controls
      preload="none"
      :src="canto.ficheiro"
      :aria-label="`${etiqueta} de ${especie}`"
    />

    <p class="credito">
      <span v-if="canto.autor">{{ canto.autor }}</span>
      <template v-if="canto.lugar"> · {{ canto.lugar }}</template>
      <!-- `ligazon`: as dúas URL veñen da API de xeno-canto e non se poñen nun
           `href` sen comprobar o esquema. -->
      <template v-if="ligazon(canto.licenza)">
        ·
        <a :href="ligazon(canto.licenza)!" rel="license">licenza</a>
      </template>
      <template v-if="ligazon(canto.orixe)">
        · <a :href="ligazon(canto.orixe)!">xeno-canto</a>
      </template>
    </p>
  </div>
</template>

<style scoped>
/* Etiqueta do tipo de gravación (canto, reclamo, tamborileo…): é a primeira
   cousa que interesa saber, así que vai como pílula e non como parágrafo. */
.tipo {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.6rem;
  padding: 0.1rem 0.6rem 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--fento-tenue);
  color: var(--fento);
  border: 1px solid color-mix(in srgb, var(--fento) 25%, transparent);
  font-size: 0.8rem;
  font-weight: 650;
  text-transform: capitalize;
}

.tipo::before {
  content: '♪';
  font-size: 0.95rem;
  line-height: 1;
}

.reprodutor {
  width: 100%;
  height: 2.75rem;
  border-radius: 999px;
}

.reprodutor:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.credito {
  margin: 0.5rem 0 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--tinta-suave);
}
</style>
