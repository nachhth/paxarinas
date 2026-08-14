<script setup lang="ts">
/**
 * Pluma para os ocos sen foto.
 *
 * Substitúe ao emoji 🪶, que estaba repetido en cinco pantallas: cada sistema
 * operativo debúxao á súa maneira, chega coas súas propias cores —que non son
 * as da app— e en moitos Android nin existe, así que saía un cadrado baleiro.
 * O mesmo criterio que xa seguía `BandadaVoando`.
 *
 * Mide `1em` a propósito: os sitios onde se usa xa fixaban o tamaño con
 * `font-size` para o emoji, e así seguen valendo sen tocarlles o CSS. A cor sae
 * de `currentColor`, así que acompaña ao tema claro e escuro soa.
 */
</script>

<template>
  <!-- O vano vai MACIZO, non contorneado. Debuxado como curva pechada e
       trazada, por moito que se lle axustase a forma, líase sempre como unha
       folla; e engadirlle barbas por dentro empeorábao, porque parecían os
       nervios da folla. O que o fai pluma son tres cousas: o vano asimétrico
       (ancho por baixo, estreito por riba), o bordo inferior partido en barbas,
       e o cañón espido saíndo por abaixo.
       O raquis é un OCO: vai como segundo subtrazado co `fill-rule="evenodd"`,
       así aparece a calquera cor de fondo sen ter que sabela. A 16 px pérdese
       de seu e non estorba; a tamaño grande é o que lle dá o remate. -->
  <svg class="pluma" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#c19a68"
      d="M18.8 3.4C16.6 4.6 14.6 6.4 13.5 7.5 11.6 9.4 9.6 12.2 8.1 14.9 8 15.6 8 16.2 8 16.8q1.6 1.6 3.7.8.9-.6 2.5-1.3 1.7-.9 1.8-2.7 1.6-1.4 1.2-3.2Q18 8.8 18.8 3.4Z"
    />
    <path
      fill="#dcc79d"
      d="M18.8 3.4C16.6 4.6 14.6 6.4 13.5 7.5 11.6 9.4 9.6 12.2 8.1 14.9 8 15.6 8 16.2 8 16.8 11 12.5 15.5 7.5 18.8 3.4Z"
    />
    <path
      fill="none" stroke="#8e7448" stroke-width="0.95" stroke-linecap="round"
      d="M18.8 3.4C15.5 7.5 11.5 12.5 8.7 16.6 7.6 18.2 6.6 19.6 5.6 20.6"
    />
  </svg>
</template>

<style scoped>
.pluma {
  width: 1em;
  height: 1em;
}

.pluma__vano {
  fill: currentColor;
}

.pluma__canon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
</style>
