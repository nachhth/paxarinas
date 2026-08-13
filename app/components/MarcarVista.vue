<script setup lang="ts">
const props = defineProps<{ slug: string }>()

const { viches, alterna, dataDe } = useVistas()

const marcada = computed(() => viches(props.slug))
const data = computed(() => dataDe(props.slug))

/** `AAAA-MM-DD` a algo lexible sen depender do idioma do sistema. */
const MESES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro']

const dataLexible = computed(() => {
  if (!data.value) return null
  const [ano, mes, dia] = data.value.split('-')
  const nomeMes = MESES[Number(mes) - 1]
  return nomeMes ? `${Number(dia)} de ${nomeMes} de ${ano}` : data.value
})

/**
 * A bandada só sae ao MARCAR, nunca ao desmarcar: celebrar que borras algo
 * sería raro. Sae do sitio real do botón, que en columna estreita cae debaixo
 * da foto e non onde estaría nunha pantalla ancha.
 *
 * A orde importa: primeiro gárdase a marca e despois se anima. Se a animación
 * fallase, a marca xa está feita — por iso vai tamén dentro dun `try`.
 */
const bandada = useTemplateRef<{ voa: (x: number, y: number) => void }>('bandada')

function pulsa(e: MouseEvent) {
  const celebra = !marcada.value
  const caixa = (e.currentTarget as HTMLElement).getBoundingClientRect()

  alterna(props.slug)

  if (!celebra) return
  try {
    bandada.value?.voa(caixa.left + caixa.width / 2, caixa.top + caixa.height / 2)
  } catch {
    // Unha marca gardada vale máis que uns paxaros.
  }
}
</script>

<template>
  <div class="marcar">
    <button
      class="boton" :class="{ 'boton--suave': !marcada }"
      :aria-pressed="marcada"
      @click="pulsa"
    >
      {{ marcada ? '✓ Xa a viches' : 'Marcar como vista' }}
    </button>
    <p v-if="dataLexible" class="nota">Marcada o {{ dataLexible }}.</p>
    <BandadaVoando ref="bandada" />
  </div>
</template>

<style scoped>
/* Vai ao carón da foto principal: a separación póñea o contedor, así que aquí
   non hai marxe propia. En columna estreita cae debaixo da foto. */
.marcar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  flex: 1 1 12rem;
}

.nota {
  margin: 0;
}
</style>
