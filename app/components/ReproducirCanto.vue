<script setup lang="ts">
import type { Canto } from '~/types/catalogo'

defineProps<{ canto: Canto; especie: string }>()

/** O tipo vén etiquetado en inglés por quen gravou. */
const TIPOS: Record<string, string> = {
  song: 'canto',
  call: 'reclamo',
  'alarm call': 'reclamo de alarma',
  'flight call': 'reclamo en voo',
  'begging call': 'reclamo de pedinchada',
  drumming: 'tamborileo',
}

function tipoEnGalego(tipo: string | null) {
  if (!tipo) return 'gravación'
  return TIPOS[tipo.toLowerCase().trim()] ?? tipo
}
</script>

<template>
  <div>
    <p class="tipo">{{ tipoEnGalego(canto.tipo) }}</p>

    <!-- Controis nativos a propósito: son accesibles de serie e non hai que
         manter unha barra de progreso propia para 15 segundos de audio. -->
    <audio
      class="reprodutor"
      controls
      preload="none"
      :src="canto.ficheiro"
      :aria-label="`Gravación de ${especie}`"
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
