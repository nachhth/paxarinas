<script setup lang="ts">
import type { Fenoloxia } from '~/types/catalogo'

const props = defineProps<{ fenoloxia: Fenoloxia }>()

const INICIAIS = ['X', 'F', 'M', 'A', 'M', 'X', 'X', 'A', 'S', 'O', 'N', 'D']
const NOMES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro']

/** Escálase contra o mes máis alto, non contra o 100%: interesa a forma da
    curva ao longo do ano, non a magnitude absoluta. */
const maximo = computed(() => Math.max(...props.fenoloxia.meses, 1))

const barras = computed(() => props.fenoloxia.meses.map((pct, i) => ({
  inicial: INICIAIS[i],
  nome: NOMES[i],
  pct,
  alto: Math.round((pct / maximo.value) * 100),
})))
</script>

<template>
  <div class="meses" role="img"
       :aria-label="`Distribución das citas ao longo do ano: ${barras
         .filter(b => b.pct > 0)
         .map(b => `${b.nome} ${b.pct}%`).join(', ')}`">
    <div
      v-for="(b, i) in barras"
      :key="b.nome"
      class="mes"
      :class="{ 'mes--cume': b.alto === 100 }"
      :style="{ '--i': i }"
      :title="`${b.nome}: ${b.pct}%`"
    >
      <div class="mes__caixa">
        <div class="mes__barra" :style="{ height: `${b.alto}%` }" />
      </div>
      <span class="mes__inicial">{{ b.inicial }}</span>
    </div>
  </div>
</template>

<style scoped>
.meses {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 3px;
  align-items: end;
  padding: 0.2rem 0 0;
}

.mes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

/* Máis alto que antes (2,5 rem): a forma da curva ao longo do ano é o dato, e
   nunha barra tan baixa a diferenza entre un mes bo e un regular non se vía. */
.mes__caixa {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 3.5rem;
  background: color-mix(in srgb, var(--tinta) 7%, transparent);
  border-radius: var(--raio-p);
  overflow: hidden;
}

.mes__barra {
  width: 100%;
  min-height: 2px;
  background: color-mix(in srgb, var(--fento) 72%, transparent);
  border-radius: var(--raio-p);
  /* Medra desde a base, escalonada mes a mes. `transform-origin` abaixo para
     que a barra saia do chan e non do centro. */
  transform-origin: bottom;
  animation: medra 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 28ms);
}

/* O mes cume vai a cor plena: é o que resume a fenoloxía dun vistazo. */
.mes--cume .mes__barra {
  background: var(--fento);
}

@keyframes medra {
  from {
    transform: scaleY(0);
    opacity: 0.4;
  }
}

.mes__inicial {
  font-size: 0.68rem;
  color: var(--tinta-suave);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.mes--cume .mes__inicial {
  color: var(--tinta);
  font-weight: 700;
}
</style>
