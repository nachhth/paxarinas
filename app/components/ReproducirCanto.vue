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
      <template v-if="canto.licenza">
        ·
        <a :href="canto.licenza" rel="license">licenza</a>
      </template>
      <template v-if="canto.orixe">
        · <a :href="canto.orixe">xeno-canto</a>
      </template>
    </p>
  </div>
</template>

<style scoped>
.tipo {
  margin: 0 0 0.4rem;
  font-weight: 600;
  text-transform: capitalize;
}

.reprodutor {
  width: 100%;
  height: 2.5rem;
}

.credito {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  color: var(--tinta-suave);
}
</style>
