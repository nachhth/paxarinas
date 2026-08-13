<script setup lang="ts">
import type { Zona } from '~/types/catalogo'

/**
 * Mapa de Galicia por comarcas, debuxado en SVG a partir dos mesmos polígonos
 * cos que se contaron as aves de cada zona.
 *
 * Non hai teselas nin ningunha petición de rede: unha capa de OpenStreetMap
 * deixaría o mapa en branco no monte, que é onde se vai usar. O que se perde
 * é o detalle do terreo; o que se gaña é que funcione sen cobertura.
 */
const seleccionada = defineModel<string | null>({ default: null })

const { zonas } = useZonas()
const { estado, posicion, erro, localiza } = useUbicacion()

/** Cinco tons segundo cantas especies se citaron na zona. */
const cortes = computed(() => cortesPorCuantil(zonas.map(z => z.especies.length)))

function nivel(zona: Zona): number {
  return nivelDe(zona.especies.length, cortes.value)
}

const zonaSeleccionada = computed(
  () => zonas.find(z => z.id === seleccionada.value) ?? null,
)

/**
 * A comarca na que está quen usa a app. Se as coordenadas caen fóra de
 * calquera polígono —no mar, na raia, ou fóra de Galicia— ofrécese a máis
 * próxima, pero marcada como aproximada para non afirmar o que non se sabe.
 */
const zonaActual = computed(() => {
  if (!posicion.value) return null
  const { lon, lat } = posicion.value
  const exacta = zonaDe(lon, lat)
  return {
    zona: exacta ?? zonaMaisPreto(lon, lat),
    exacta: exacta !== null,
  }
})

/** Radio da incerteza que dá o navegador, en unidades do debuxo. */
const radioPrecision = computed(() => {
  if (!posicion.value) return 0
  const METROS_POR_GRAO = 111320
  return (posicion.value.precision / METROS_POR_GRAO) * lenzo.escala
})

const marcador = computed(() => {
  if (!posicion.value) return null
  return aLenzo([posicion.value.lon, posicion.value.lat])
})

watch(zonaActual, (actual) => {
  if (actual) seleccionada.value = actual.zona.id
})

const porProvincia = computed(() => {
  const grupos = new Map<string, Zona[]>()
  for (const zona of [...zonas].sort((a, b) => a.nome.localeCompare(b.nome, 'gl'))) {
    const clave = zona.provincia ?? 'Outras'
    grupos.set(clave, [...(grupos.get(clave) ?? []), zona])
  }
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'gl'))
})
</script>

<template>
  <div class="mapa">
    <div class="mapa__controis">
      <!-- O selector non é un extra de accesibilidade: nun móbil hai comarcas
           pequenas de máis para acertalas co dedo. -->
      <select v-model="seleccionada" class="control mapa__selector" aria-label="Escoller comarca">
        <option :value="null">Escolle unha comarca…</option>
        <optgroup v-for="[provincia, lista] in porProvincia" :key="provincia" :label="provincia">
          <option v-for="z in lista" :key="z.id" :value="z.id">
            {{ z.nome }} ({{ z.especies.length }})
          </option>
        </optgroup>
      </select>

      <!-- Debúxase sempre, tamén no servidor: agochalo segundo o navegador
           teña ou non xeolocalización faría que o botón aparecese despois de
           hidratar, e iso é un desaxuste. Se non a hai, dise ao premelo. -->
      <button
        type="button"
        class="boton boton--suave mapa__boton"
        :disabled="estado === 'buscando'"
        @click="localiza"
      >
        <!-- Mentres busca, o mesmo botón: cambiar de texto e nada máis daba a
             impresión de que non pasaba nada. O punto latexa. -->
        <span v-if="estado === 'buscando'" class="pulso" aria-hidden="true" />
        <span v-else aria-hidden="true">📍</span>
        {{ estado === 'buscando' ? 'Localizando…' : 'Onde estou' }}
      </button>
    </div>

    <p v-if="erro" class="mapa__erro" role="status">{{ erro }}</p>

    <p v-else-if="zonaActual" class="mapa__aquí" role="status">
      <template v-if="zonaActual.exacta">
        Estás en <strong>{{ zonaActual.zona.nome }}</strong>.
      </template>
      <template v-else>
        Non estás dentro de ningunha comarca galega; a máis próxima é
        <strong>{{ zonaActual.zona.nome }}</strong>.
      </template>
      <span v-if="posicion" class="mapa__precision">
        Precisión de ±{{ Math.round(posicion.precision) }} m.
      </span>
    </p>

    <svg
      class="mapa__lenzo"
      :viewBox="lenzo.viewBox"
      role="group"
      aria-label="Mapa das comarcas de Galicia. Cada comarca indica cantas especies de aves ten citadas."
    >
      <path
        v-for="zona in zonas"
        :key="zona.id"
        :d="trazo(zona)"
        class="zona"
        :class="{ 'zona--activa': zona.id === seleccionada }"
        :style="{ fillOpacity: OPACIDADES[nivel(zona)] }"
        role="button"
        tabindex="0"
        :aria-pressed="zona.id === seleccionada"
        :aria-label="`${zona.nome}, ${zona.especies.length} especies citadas`"
        @click="seleccionada = zona.id"
        @keydown.enter.prevent="seleccionada = zona.id"
        @keydown.space.prevent="seleccionada = zona.id"
      >
        <title>{{ zona.nome }} — {{ zona.especies.length }} especies</title>
      </path>

      <!-- A circunferencia é a incerteza real que declara o navegador. Sen
           ela un punto pequeno faría crer que a posición é exacta. -->
      <circle
        v-if="marcador && radioPrecision > 2"
        class="onde onde--precision"
        :cx="marcador[0]"
        :cy="marcador[1]"
        :r="radioPrecision"
      />
      <circle
        v-if="marcador"
        class="onde"
        :cx="marcador[0]"
        :cy="marcador[1]"
        r="6"
      />
    </svg>

    <div class="lenda" aria-hidden="true">
      <span class="lenda__texto">menos especies citadas</span>
      <span
        v-for="(o, i) in OPACIDADES"
        :key="i"
        class="lenda__caixa"
        :style="{ opacity: o }"
      />
      <span class="lenda__texto">máis</span>
    </div>

    <p v-if="zonaSeleccionada" class="mapa__pé">
      <strong>{{ zonaSeleccionada.nome }}</strong>
      <span v-if="zonaSeleccionada.provincia"> · {{ zonaSeleccionada.provincia }}</span>
      · {{ zonaSeleccionada.especies.length }} especies
      · {{ zonaSeleccionada.citas.toLocaleString('gl') }} citas
    </p>
  </div>
</template>

<style scoped>
.mapa__controis {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

/* `.control` e `.boton` veñen de base.css; aquí só o reparto do ancho. */
.mapa__selector {
  flex: 1 1 14rem;
}

.mapa__boton {
  cursor: pointer;
}

.mapa__boton:disabled {
  cursor: progress;
}

/* Punto que late mentres o navegador resolve a posición. */
.pulso {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--fento);
  animation: late 1.1s ease-in-out infinite;
}

@keyframes late {
  50% {
    opacity: 0.25;
    transform: scale(0.7);
  }
}

.mapa__erro,
.mapa__aquí {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: var(--raio);
  background: var(--papel);
  border: 1px solid var(--borde);
  border-left: 3px solid var(--fento);
  font-size: 0.9rem;
  animation: asoma 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.mapa__erro {
  border-left-color: var(--toxo);
}

@keyframes asoma {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.mapa__precision {
  color: var(--tinta-suave);
}

.mapa__lenzo {
  display: block;
  width: 100%;
  height: auto;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio-g);
}

.zona {
  fill: var(--fento);
  stroke: var(--papel);
  stroke-width: 1.5;
  cursor: pointer;
  transition: fill-opacity var(--saída), stroke-width var(--saída);
}

/* Só cambia o contorno: subirlle a opacidade do recheo faríaa parecer doutro
   tramo da escala, e a escala é o dato. */
.zona:hover {
  stroke: var(--tinta);
  stroke-width: 2;
}

/* O anel de foco por defecto é un rectángulo arredor da caixa do trazado e
   non segue a comarca: substitúese por un contorno groso na cor do toxo. */
.zona:focus-visible {
  outline: none;
  stroke: var(--toxo);
  stroke-width: 3;
}

.zona--activa {
  stroke: var(--tinta);
  stroke-width: 3;
}

.onde {
  fill: var(--toxo);
  stroke: var(--tinta);
  stroke-width: 2;
}

.onde--precision {
  fill: var(--toxo);
  fill-opacity: 0.2;
  stroke: var(--toxo);
  stroke-width: 1;
}

.lenda {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 0.6rem;
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  color: var(--tinta-suave);
}

/* Sen ocos entre as caixas: unha escala continua lese como escala; separada
   parecían cinco categorías soltas. */
.lenda__caixa {
  width: 1.6rem;
  height: 0.55rem;
  background: var(--fento);
}

.lenda__caixa:first-of-type {
  border-radius: 3px 0 0 3px;
}

.lenda__caixa:last-of-type {
  border-radius: 0 3px 3px 0;
}

.lenda__texto {
  white-space: nowrap;
}

.lenda__texto:first-child {
  margin-right: 0.45rem;
}

.lenda__texto:last-child {
  margin-left: 0.45rem;
}

/* Resumo da comarca escollida: é a resposta á acción de premer, así que se
   destaca sobre o resto do pé do mapa. */
.mapa__pé {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.5rem;
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.8rem;
  background: var(--fento-tenue);
  border-radius: var(--raio);
  font-size: 0.9rem;
  color: var(--tinta-suave);
  font-variant-numeric: tabular-nums;
}

.mapa__pé strong {
  font-size: 1.05rem;
  color: var(--tinta);
}
</style>
