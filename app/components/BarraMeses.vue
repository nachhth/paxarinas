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
    <div v-for="b in barras" :key="b.nome" class="mes" :title="`${b.nome}: ${b.pct}%`">
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
  gap: 2px;
  align-items: end;
}

.mes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.mes__caixa {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 2.5rem;
  background: var(--bretema);
  border-radius: 2px;
}

.mes__barra {
  width: 100%;
  min-height: 1px;
  background: var(--fento);
  border-radius: 2px;
}

.mes__inicial {
  font-size: 0.65rem;
  color: var(--tinta-suave);
  line-height: 1;
}
</style>
