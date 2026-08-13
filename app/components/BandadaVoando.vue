<script setup lang="ts">
/**
 * A bandada que sae voando ao marcar unha ave como vista.
 *
 * Non é confeti: son siluetas de paxaro que saen do propio botón, ábrense en
 * abano cara arriba e esváense ao subir. Dura pouco máis dun segundo e non
 * intercepta nada — a marca xa está gardada antes de que isto empece.
 *
 * Tres decisións que conviñan:
 *
 * - **Siluetas SVG, non emojis.** Un 🐦 debúxao cada sistema á súa maneira e
 *   nunha guía de campo iso rompe o ton. O trazo vai coas cores do proxecto.
 * - **Tres capas por paxaro** para conseguir un arco sen animar `left`/`top`:
 *   a de fóra move en X a ritmo constante, a do medio move en Y con
 *   desaceleración, e a de dentro só bate as ás. Multiplícanse os `transform`
 *   e sae unha parábola sen tocar o deseño da páxina nin unha vez.
 * - **O contedor é `position: fixed` con `overflow: hidden`.** Os paxaros
 *   saen da pantalla por arriba e polos lados; sen recorte, calquera deles
 *   estiraría o documento e faría aparecer unha barra horizontal.
 *
 * Con `prefers-reduced-motion` non se crea nin un nodo: `voa()` sae antes de
 * tocar o DOM. É o criterio de todo o proxecto e aquí non ten excepción.
 */

interface Paxaro {
  id: number
  estilo: Record<string, string>
}

/** Nin poucos nin festa de confeti. Nove len como bandada e non como enxame. */
const CANTOS = 9

/** As tres cores levan a paleta ao tema: `--fento` e `--fento-claro` inverten
    a claridade no modo escuro, así que a bandada vese nos dous sen tocar nada. */
const CORES = ['var(--fento)', 'var(--fento-claro)', 'var(--toxo)']

const paxaros = ref<Paxaro[]>([])

let semente = 0
let limpeza: ReturnType<typeof setTimeout> | null = null

function entre(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/** Quen pide menos movemento non recibe ningún: nin animación nin nodos. */
function moveseAlgo() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Solta a bandada desde un punto da xanela (coordenadas de viewport, as que
 * devolve `getBoundingClientRect`). Chámase co centro do botón, non cunha
 * posición fixa: o botón cae debaixo da foto en columna estreita.
 */
function voa(x: number, y: number) {
  if (!import.meta.client || !moveseAlgo()) return

  const alto = window.innerHeight
  const ancho = window.innerWidth
  const bando: Paxaro[] = []

  for (let i = 0; i < CANTOS; i++) {
    // O abano repártese en 150°, un tramo por paxaro, e cada un móvese un
    // pouco dentro do seu. Repartir ao chou deixaba ocos e apelotoamentos.
    const tramo = (i + 0.5) / CANTOS
    const angulo = (tramo - 0.5) * 150 + entre(-9, 9)
    const rad = (angulo * Math.PI) / 180

    // Distancia en proporción á xanela: nun móbil o voo é máis curto en
    // píxeles, pero lese igual de longo.
    const dist = alto * entre(0.42, 0.7)

    bando.push({
      id: ++semente,
      estilo: {
        '--x': `${x}px`,
        '--y': `${y}px`,
        // Non fai falla saír máis alá do bordo: alí xa non se ve nada.
        '--dx': `${Math.max(-ancho, Math.min(ancho, Math.sin(rad) * dist))}px`,
        '--dy': `${-Math.cos(rad) * dist}px`,
        '--xiro': `${angulo * 0.35}deg`,
        '--escala': `${entre(0.72, 1.12)}`,
        '--cor': CORES[i % CORES.length] as string,
        '--dur': `${Math.round(entre(860, 1120))}ms`,
        '--atraso': `${Math.round(entre(0, 150))}ms`,
        // Cada un co seu ritmo de aleteo: coordinados parecerían un mecanismo.
        '--aleteo': `${Math.round(entre(150, 240))}ms`,
      },
    })
  }

  paxaros.value = bando

  // Fóra do DOM ao rematar. Sen isto quedarían nove nodos por cada marca.
  if (limpeza) clearTimeout(limpeza)
  limpeza = setTimeout(() => { paxaros.value = [] }, 1400)
}

onBeforeUnmount(() => {
  if (limpeza) clearTimeout(limpeza)
})

defineExpose({ voa })
</script>

<template>
  <Teleport v-if="paxaros.length" to="body">
    <div class="bandada" aria-hidden="true">
      <span v-for="p in paxaros" :key="p.id" class="paxaro" :style="p.estilo">
        <span class="paxaro__sobe">
          <svg class="paxaro__ala" viewBox="0 0 24 14" width="26" height="15">
            <path
              d="M12 8.2C13.2 6 15.6 3.6 18.4 3c2-.4 3.4.2 4 1-2.4.4-5 2.2-6.8
                 4.8-1 1.4-2.2 2.4-3.6 2.6-1.4-.2-2.6-1.2-3.6-2.6C6.6 6.2 4 4.4
                 1.6 4c.6-.8 2-1.4 4-1C8.4 3.6 10.8 6 12 8.2Z"
            />
          </svg>
        </span>
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
/* Por riba de todo e sen tocar o rato. O `overflow: hidden` é o que garante
   que ningún paxaro poida estirar o documento nin sacar barras. */
.bandada {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint;
}

/* Capa 1 — deriva lateral, a ritmo constante. */
.paxaro {
  position: absolute;
  top: var(--y);
  left: var(--x);
  display: block;
  will-change: transform;
  animation: bandada-deriva var(--dur) linear var(--atraso) both;
}

/* Capa 2 — subida con desaceleración, e o esvaecemento. Ao combinarse coa de
   arriba, a traxectoria describe un arco. */
.paxaro__sobe {
  display: block;
  will-change: transform, opacity;
  animation: bandada-sobe var(--dur) cubic-bezier(0.15, 0.6, 0.3, 1) var(--atraso) both;
}

/* Capa 3 — o aleteo. `scaleY` sobre a silueta: coas ás erguidas ocupa todo o
   alto e ao bater aplánase. O eixo vai no corpo, non no centro da caixa. */
.paxaro__ala {
  display: block;
  margin: -7px 0 0 -13px;
  fill: var(--cor);
  transform-origin: 50% 78%;
  will-change: transform;
  animation: bandada-aleteo var(--aleteo) ease-in-out var(--atraso) infinite;
}

@keyframes bandada-deriva {
  to {
    transform: translateX(var(--dx));
  }
}

@keyframes bandada-sobe {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.45);
  }

  14% {
    opacity: 1;
  }

  62% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateY(var(--dy)) scale(var(--escala));
  }
}

@keyframes bandada-aleteo {
  0%,
  100% {
    transform: rotate(var(--xiro)) scaleY(1);
  }

  50% {
    transform: rotate(var(--xiro)) scaleY(0.3);
  }
}

/* Redundante —`voa()` xa non crea nada—, pero deixa constancia na folla e
   protexe se algún día se chama doutro sitio. */
@media (prefers-reduced-motion: reduce) {
  .bandada {
    display: none;
  }
}
</style>
