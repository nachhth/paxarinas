<script setup lang="ts">
/**
 * Caixón de axustes, que entra pola dereita.
 *
 * Vive na ficha, debaixo da foto. Estivo na barra verde da cabeceira, pero o
 * único que hai dentro é a orde das seccións da ficha: na portada ou no mapa era
 * unha rodiña que non levaba a nada útil. E ao final da ficha tampouco, que
 * obrigaba a baixar polas doce tarxetas para poder movelas.
 *
 * O que fai que isto sexa un diálogo e non unha capa bonita:
 *   · `Esc` péchao, e tamén premer fóra;
 *   · o foco vai ao panel ao abrir e volve á rodiña ao pechar, senón quen
 *     navega con teclado queda tabulando por detrás da capa;
 *   · mentres está aberto o corpo non se despraza, que se non a páxina de
 *     detrás móvese soa ao rolar dentro do panel;
 *   · `inert` no resto non se usa porque non o dá todo o mundo: o que se fai é
 *     non deixar saír o foco.
 */
const aberto = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')
const rodiña = useTemplateRef<HTMLButtonElement>('rodiña')

function abre() {
  aberto.value = true
  nextTick(() => panel.value?.focus())
}

function pecha() {
  aberto.value = false
  // Devólvese o foco a onde estaba: sen isto, ao pechar o foco vai ao <body> e
  // hai que tabular desde o principio da páxina.
  nextTick(() => rodiña.value?.focus())
}

function aoTeclear(e: KeyboardEvent) {
  if (e.key === 'Escape') pecha()
}

// O corpo non se despraza mentres está aberto. Restáurase sempre, tamén se o
// compoñente morre co panel aberto.
watch(aberto, (v) => {
  if (!import.meta.client) return
  document.body.style.overflow = v ? 'hidden' : ''
})
onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <div class="axustes">
    <button
      ref="rodiña" class="axustes__rodiña" :aria-expanded="aberto"
      aria-label="Axustes" @click="abre"
    >
      <!-- Roda dentada de verdade: oito dentes e buraco central. O que había
           antes era un círculo con raios saíndo, que non é un engranaxe senón
           un sol — e líase como un control de brillo. O camiño está xerado
           xeometricamente (dente e val alternando arcos), non debuxado a ollo. -->
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.82 1.73A10.5 10.5 0 0 1 14.18 1.73L13.58 4.26A7.9 7.9 0 0 1 16.36 5.41L17.72 3.19A10.5 10.5 0 0 1 20.81 6.28L18.59 7.64A7.9 7.9 0 0 1 19.74 10.42L22.27 9.82A10.5 10.5 0 0 1 22.27 14.18L19.74 13.58A7.9 7.9 0 0 1 18.59 16.36L20.81 17.72A10.5 10.5 0 0 1 17.72 20.81L16.36 18.59A7.9 7.9 0 0 1 13.58 19.74L14.18 22.27A10.5 10.5 0 0 1 9.82 22.27L10.42 19.74A7.9 7.9 0 0 1 7.64 18.59L6.28 20.81A10.5 10.5 0 0 1 3.19 17.72L5.41 16.36A7.9 7.9 0 0 1 4.26 13.58L1.73 14.18A10.5 10.5 0 0 1 1.73 9.82L4.26 10.42A7.9 7.9 0 0 1 5.41 7.64L3.19 6.28A10.5 10.5 0 0 1 6.28 3.19L7.64 5.41A7.9 7.9 0 0 1 10.42 4.26Z" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="caixon">
        <div v-if="aberto" class="caixon" @keydown="aoTeclear">
          <!-- O fondo escuro é un botón de verdade e non un `div` con `@click`:
               así tamén responde ao teclado e os lectores de pantalla saben que
               se pode pechar. -->
          <button class="caixon__fondo" aria-label="Pechar os axustes" @click="pecha" />

          <div
            ref="panel" class="caixon__panel" tabindex="-1"
            role="dialog" aria-modal="true" aria-label="Axustes"
          >
            <div class="caixon__cabeza">
              <h2 class="caixon__titulo">Axustes</h2>
              <button class="caixon__pechar" aria-label="Pechar" @click="pecha">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div class="caixon__corpo">
              <h3 class="caixon__rotulo">Orde das seccións da ficha</h3>
              <OrdenarSeccions />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Vive na páxina, non sobre a barra verde: cor de tinta normal e borde suave,
   que sobre o fondo claro un botón translúcido branco non se vería. */
.axustes__rodiña {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  padding: 0;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: var(--papel);
  color: var(--tinta-suave);
  cursor: pointer;
  transition: background var(--saída), border-color var(--saída), transform var(--entrada);
}

/* O botón mide 30 px, pero o que se toca segue medindo 44.
   O sistema de deseño non admite nada táctil por baixo de 44 px, e con 30 reais
   este fallaríase co dedo unha de cada tres veces. A área invisible resólveo sen
   facer o círculo máis grande: é o truco de sempre para iconas pequenas.
   `inset: -7px` → 30 + 7 + 7 = 44. */
.axustes__rodiña::after {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 999px;
}

.axustes__rodiña:hover {
  border-color: var(--fento-claro);
  color: var(--fento);
}

/* Xira ao pasar por riba: é a única pista de que abre algo. */
.axustes__rodiña:hover svg {
  transform: rotate(35deg);
}

.axustes__rodiña:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.axustes__rodiña svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--entrada);
}

.caixon {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

.caixon__fondo {
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  background: rgb(20 23 15 / 55%);
  cursor: pointer;
}

.caixon__panel {
  position: relative;
  width: min(24rem, 92vw);
  display: flex;
  flex-direction: column;
  background: var(--bretema);
  box-shadow: var(--sombra-alta);
  /* A franxa do sistema abaixo e a barra de estado arriba. */
  padding-bottom: env(safe-area-inset-bottom, 0);
  overflow: hidden;
}

.caixon__cabeza {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.7rem 0.7rem 0.7rem 1.1rem;
  background: var(--cabeceira-fondo);
  color: var(--cabeceira-tinta);
}

.caixon__titulo {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: inherit;
}

.caixon__pechar {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border: none;
  border-radius: 999px;
  background: rgb(255 255 255 / 14%);
  color: inherit;
  cursor: pointer;
}

.caixon__pechar:hover {
  background: rgb(255 255 255 / 26%);
}

.caixon__pechar svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.caixon__corpo {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1.1rem 1.5rem;
}

.caixon__rotulo {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--tinta-suave);
}

/* Entra deslizando e o fondo esvaece. Quen pediu menos movemento só ve o
   cambio de opacidade. */
.caixon-enter-active .caixon__panel,
.caixon-leave-active .caixon__panel {
  transition: transform var(--entrada);
}

.caixon-enter-from .caixon__panel,
.caixon-leave-to .caixon__panel {
  transform: translateX(100%);
}

.caixon-enter-active .caixon__fondo,
.caixon-leave-active .caixon__fondo {
  transition: opacity var(--entrada);
}

.caixon-enter-from .caixon__fondo,
.caixon-leave-to .caixon__fondo {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .caixon-enter-from .caixon__panel,
  .caixon-leave-to .caixon__panel {
    transform: none;
  }
}
</style>
