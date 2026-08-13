<script setup lang="ts">
/**
 * A bandada que sae voando ao marcar unha ave como vista.
 *
 * Non é confeti: son siluetas de paxaro que arrancan do propio botón, soben
 * describindo un arco amplo, pasan por riba e saen pola outra banda da
 * pantalla, como cando che cruza unha bandada por diante. Dura arredor de
 * segundo e medio — vaise ver vinte veces nunha saída de campo, así que ten
 * que ser vistosa e acabar axiña.
 *
 * Catro decisións que conviñan:
 *
 * - **Siluetas SVG, non emojis.** Un 🐦 debúxao cada sistema á súa maneira e
 *   nunha guía de campo iso rompe o ton. As cores son as da paleta.
 * - **Catro capas por paxaro** para conseguir un arco balístico de verdade sen
 *   animar nunca `left`/`top`: a de fóra move en X a ritmo constante, a
 *   seguinte sobe e volve baixar (con desaceleración ao subir e aceleración ao
 *   caer), a terceira inclina o voo e a de dentro só bate as ás. Os
 *   `transform` multiplícanse e sae a curva, sen tocar o deseño da páxina.
 * - **Toda a bandada vai na mesma dirección**, cara ao lado onde hai máis
 *   sitio. O que fai que se lea como formación e non como bloque son as saídas
 *   escalonadas e que cada un leve a súa altura de arco e o seu aleteo.
 * - **O contedor é `position: fixed` con `overflow: hidden`.** O percorrido é
 *   máis largo que a xanela a propósito; sen recorte, calquera paxaro estiraría
 *   o documento e sacaría unha barra horizontal.
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

/** As dúas cores inverten a claridade no modo escuro (`--fento` é verde
    escuro no claro e verde vivo no escuro), así que a bandada destaca contra o
    fondo nos dous temas sen ter que decidir nada aquí. O amarelo `--toxo`
    quedou fóra: sobre a brétema clara non chega a lerse. */
const CORES = ['var(--fento)', 'var(--fento)', 'var(--fento-claro)']

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

  // Cara ao lado onde queda máis pantalla por diante: se non, nun botón pegado
  // ao bordo dereito o arco remataría antes de empezar.
  const sentido = x < ancho / 2 ? 1 : -1

  const bando: Paxaro[] = []

  // O que falta para saír pola outra banda desde o botón. O percorrido
  // calcúlase a partir de aquí e non cunha proporción da xanela: se non, un
  // botón que estea xa preto do bordo bota a bandada fóra en tres décimas e a
  // animación remata antes de verse.
  const fuga = (sentido > 0 ? ancho - x : x) + 80

  for (let i = 0; i < CANTOS; i++) {
    // Escalonado en cuña: os primeiros saen algo adiantados e a alturas
    // distintas. Todos exactamente do mesmo punto darían un bloque.
    const posto = i / (CANTOS - 1)

    // A cima queda dentro da xanela mentres o botón non estea moi arriba: o
    // arco vese enteiro, non só a subida.
    const cima = -Math.min(alto * entre(0.34, 0.5), Math.max(140, y - 40))

    bando.push({
      id: ++semente,
      estilo: {
        '--x': `${x + sentido * entre(-26, 26)}px`,
        '--y': `${y + entre(-14, 14)}px`,
        // O divisor é a fracción do voo na que o paxaro abandona a pantalla:
        // entre o 80% e o 92%. Medido, sen isto marchaban aos 700 ms e o arco
        // remataba fóra de cadro.
        '--dx': `${(sentido * fuga) / entre(0.82, 0.93)}px`,
        '--cima': `${cima}px`,
        // Rematan baixando: o arco pecha cara ao horizonte do outro lado.
        '--fin': `${cima * entre(0.1, 0.45)}px`,
        // Inclinación: proa arriba ao subir, proa abaixo ao caer.
        '--xiro0': `${sentido * -15}deg`,
        '--xiro1': `${sentido * 14}deg`,
        // A silueta mira á dereita: cara á esquerda vai en espello, para que a
        // cabeza vaia sempre diante e non voen de cu.
        '--espello': `${sentido}`,
        '--escala': `${entre(0.85, 1.25)}`,
        '--cor': CORES[i % CORES.length] as string,
        '--dur': `${Math.round(entre(1080, 1220))}ms`,
        // O escalonado é o que fai que se lea como formación e o que estira o
        // conxunto ata arredor de 1,3 s. Máis cola e pasaría do segundo e
        // medio: isto vaise ver vinte veces nunha saída de campo e cansaría.
        '--atraso': `${Math.round(posto * entre(320, 420))}ms`,
        // Cada un co seu ritmo de aleteo: coordinados parecerían un mecanismo.
        '--aleteo': `${Math.round(entre(170, 260))}ms`,
      },
    })
  }

  paxaros.value = bando

  // Fóra do DOM ao rematar. Sen isto quedarían nove nodos por cada marca.
  if (limpeza) clearTimeout(limpeza)
  limpeza = setTimeout(() => { paxaros.value = [] }, 1650)
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
        <span class="paxaro__arco">
          <span class="paxaro__xiro">
            <!-- Ás longas e case horizontais, corpo, cabeza e cola. Un simple
                 "V" sen corpo lese como un chevrón, non como un paxaro: o que
                 fai a silueta recoñecible é a masa do centro. -->
            <svg class="paxaro__ave" viewBox="0 0 44 18" width="52" height="21">
              <g class="paxaro__as">
                <path
                  d="M22 13.8c-2.2 0-4.6-1.2-7.6-3.4C10 7 5.2 5 .8 4.6c1.8 3.4
                     4.6 6.6 8 8.8 3.8 2.4 8.2 3.6 13.2 3.6s9.4-1.2 13.2-3.6c3.4
                     -2.2 6.2-5.4 8-8.8-4.4.4-9.2 2.4-13.6 5.8-3 2.2-5.4 3.4-7.6
                     3.4Z"
                />
              </g>
              <ellipse cx="22" cy="13.6" rx="5" ry="2.6" />
              <circle cx="27.2" cy="12" r="2.1" />
              <path d="M17.6 12.6 11.8 10.8 13.6 15.8Z" />
            </svg>
          </span>
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

/* Capa 1 — travesía lateral a ritmo constante, máis a entrada e o
   esvaecemento. A opacidade vive aquí, na capa lineal, para non herdar as
   curvas de aceleración do arco. */
.paxaro {
  position: absolute;
  top: var(--y);
  left: var(--x);
  display: block;
  will-change: transform, opacity;
  animation: bandada-cruza var(--dur) linear var(--atraso) both;
}

/* Capa 2 — o arco: sobe desacelerando ata a cima e cae acelerando. É o
   movemento dun corpo que se impulsa, non unha rampla. */
.paxaro__arco {
  display: block;
  will-change: transform;
  animation: bandada-arco var(--dur) var(--atraso) both;
}

/* Capa 3 — a inclinación segue a tanxente do arco. */
.paxaro__xiro {
  display: block;
  animation: bandada-xiro var(--dur) linear var(--atraso) both;
}

/* A silueta. O `margin` negativo é o que centra o paxaro no punto de saída sen
   ter que envolvelo nunha caixa con posicionamento. O espello xira a ave cara
   ao lado ao que voa; non se anima, así que non custa nada. */
.paxaro__ave {
  display: block;
  margin: -11px 0 0 -26px;
  fill: var(--cor);
  transform: scaleX(var(--espello));
}

/* Capa 4 — o aleteo, e só sobre as ás: se se aplicase a toda a silueta, o
   corpo aplanaríase con elas e o paxaro deixaría de lerse ao bater. O eixo vai
   no lombo, que é onde arrancan as ás de verdade. */
.paxaro__as {
  transform-box: view-box;
  transform-origin: 50% 76%;
  will-change: transform;
  animation: bandada-aleteo var(--aleteo) ease-in-out var(--atraso) infinite;
}

/* O 22% leva o 22% do percorrido: o punto intermedio existe só para que a
   escala remate cedo, e mantén o X lineal. */
@keyframes bandada-cruza {
  0% {
    opacity: 0;
    transform: translateX(0) scale(0.45);
  }

  10% {
    opacity: 1;
  }

  22% {
    transform: translateX(calc(var(--dx) * 0.22)) scale(var(--escala));
  }

  82% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(var(--dx)) scale(var(--escala));
  }
}

@keyframes bandada-arco {
  0% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0.15, 0.7, 0.4, 1);
  }

  52% {
    transform: translateY(var(--cima));
    animation-timing-function: cubic-bezier(0.6, 0, 0.85, 0.45);
  }

  100% {
    transform: translateY(var(--fin));
  }
}

@keyframes bandada-xiro {
  from {
    transform: rotate(var(--xiro0));
  }

  to {
    transform: rotate(var(--xiro1));
  }
}

@keyframes bandada-aleteo {
  0%,
  100% {
    transform: scaleY(1);
  }

  50% {
    transform: scaleY(0.42);
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
