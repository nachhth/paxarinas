<script setup lang="ts">
/**
 * `compacto` é o botón só, en pílula translúcida, para ir enriba da foto a
 * sangre da ficha. Alí non cabe a liña «Marcada o …», que a pinta a propia
 * ficha debaixo da imaxe: o dato non se perde, cambia de sitio.
 */
const props = defineProps<{ slug: string, compacto?: boolean }>()

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
  <div class="marcar" :class="{ 'marcar--compacto': compacto }">
    <button
      v-if="compacto"
      class="pílula" :class="{ 'pílula--feita': marcada }"
      :aria-pressed="marcada"
      @click="pulsa"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      {{ marcada ? 'Xa a viches' : 'Marcar como vista' }}
    </button>

    <button
      v-else
      class="boton" :class="{ 'boton--suave': !marcada }"
      :aria-pressed="marcada"
      @click="pulsa"
    >
      {{ marcada ? '✓ Xa a viches' : 'Marcar como vista' }}
    </button>

    <p v-if="dataLexible && !compacto" class="nota">Marcada o {{ dataLexible }}.</p>
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

/* Sobre a foto: sen ancho propio e sen medrar. */
.marcar--compacto {
  display: block;
  flex: none;
}

/* Pílula translúcida co seu propio escurecido: a foto de detrás pode ser clara
   ou escura, e o botón ten que lerse nas dúas. 44 px de alto, que é o mínimo
   táctil que fixa o sistema de deseño. */
.pílula {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0 0.9rem;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 999px;
  background: rgb(20 23 15 / 45%);
  backdrop-filter: blur(6px);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 650;
  cursor: pointer;
  transition: background var(--saída), transform var(--saída);
}

.pílula:hover {
  background: rgb(20 23 15 / 62%);
}

.pílula:active {
  transform: scale(0.97);
}

.pílula:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

/* Marcada: pasa a verde de marca, que é o mesmo sinal que na lista. */
.pílula--feita {
  background: var(--fento);
  border-color: transparent;
  color: var(--boton-tinta);
}

.pílula svg {
  width: 1.05rem;
  height: 1.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
