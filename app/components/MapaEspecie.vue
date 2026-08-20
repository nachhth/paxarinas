<script setup lang="ts">
/**
 * En que comarcas está citada unha especie.
 *
 * Comparte encadre e polígonos co mapa xeral, así que os dous mapas da app se
 * poden comparar dun vistazo. O que amosa é onde hai citas rexistradas, que
 * non é o mesmo que onde vive a ave: hai moitas máis citas onde hai máis xente
 * mirando, e as rías concentran tanto aves como observadores.
 */
const props = defineProps<{
  /** Posición da especie no catálogo. */
  indice: number
  nome: string
}>()

const { zonas } = useZonas()
const { estado, posicion, erro, localiza } = useUbicacion()

const presenzas = computed(() => zonasDeEspecie(props.indice))

const citasPorZona = computed(() => {
  const mapa = new Map<string, number>()
  for (const { zona, citas } of presenzas.value) mapa.set(zona.id, citas)
  return mapa
})

const cortes = computed(() => cortesPorCuantil(presenzas.value.map(p => p.citas)))

function nivel(id: string): number | null {
  const citas = citasPorZona.value.get(id)
  return citas === undefined ? null : nivelDe(citas, cortes.value)
}

/** As tres comarcas con máis citas, que é o que resume de verdade o mapa. */
const principais = computed(() => presenzas.value.slice(0, 3))

const zonaActual = computed(() => {
  if (!posicion.value) return null
  const { lon, lat } = posicion.value
  const exacta = zonaDe(lon, lat)
  const zona = exacta ?? zonaMaisPreto(lon, lat)
  return { zona, exacta: exacta !== null, citas: citasPorZona.value.get(zona.id) ?? 0 }
})

const marcador = computed(() => (posicion.value ? aLenzo([posicion.value.lon, posicion.value.lat]) : null))
</script>

<template>
  <div>
    <p v-if="!presenzas.length" class="sen-datos">
      Ningunha das súas citas ten localización precisa abondo para situala nunha
      comarca.
    </p>

    <template v-else>
      <p class="resumo">
        Citada en <strong>{{ presenzas.length }}</strong> das {{ zonas.length }}
        comarcas.
        <template v-if="principais.length">
          Onde máis:
          <span class="principais">
            {{ principais.map(p => p.zona.nome).join(', ') }}.
          </span>
        </template>
      </p>

      <svg
        class="lenzo"
        :viewBox="lenzo.viewBox"
        role="img"
        :aria-label="`Mapa de Galicia: ${nome} está citada en ${presenzas.length} das ${zonas.length} comarcas.`"
      >
        <path
          v-for="zona in zonas"
          :key="zona.id"
          :d="trazo(zona)"
          class="zona"
          :class="{ 'zona--baleira': nivel(zona.id) === null }"
          :style="nivel(zona.id) !== null ? { fillOpacity: OPACIDADES[nivel(zona.id)!] } : undefined"
        >
          <title>
            {{ zona.nome }} —
            {{ citasPorZona.get(zona.id)
              ? `${numero(citasPorZona.get(zona.id)!)} citas`
              : 'sen citas' }}
          </title>
        </path>

        <circle v-if="marcador" class="onde" :cx="marcador[0]" :cy="marcador[1]" r="6" />
      </svg>

      <div class="pé">
        <button
          type="button"
          class="boton boton--suave botón"
          :disabled="estado === 'buscando'"
          @click="localiza"
        >
          <span v-if="estado === 'buscando'" class="pulso" aria-hidden="true" />
          <svg class="chincheta" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.6"/></svg>
          {{ estado === 'buscando' ? 'Localizando…' : 'Vese onde estou?' }}
        </button>

        <p v-if="erro" class="nota" role="status">{{ erro }}</p>

        <p v-else-if="zonaActual" class="nota" role="status">
          <template v-if="zonaActual.citas">
            Si: en <strong>{{ zonaActual.zona.nome }}</strong> hai
            {{ numero(zonaActual.citas) }} citas desta ave.
          </template>
          <template v-else>
            En <strong>{{ zonaActual.zona.nome }}</strong> non consta ningunha
            cita desta ave. Iso non quere dicir que non a haxa: pode que ninguén
            a rexistrase alí.
          </template>
          <span v-if="!zonaActual.exacta" class="nota__matiz">
            (Estás fóra de Galicia; esa é a comarca máis próxima.)
          </span>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.resumo {
  margin: 0 0 0.8rem;
  text-wrap: pretty;
}

.resumo strong {
  font-size: 1.05em;
}

.principais {
  color: var(--tinta-suave);
}

.lenzo {
  display: block;
  width: 100%;
  max-width: 26rem;
  height: auto;
  /* Aparece cando o compoñente monta no cliente, no oco que xa reservou a
     ficha: sen isto entraba de golpe onde antes había un esqueleto. */
  animation: revela 340ms ease-out both;
}

@keyframes revela {
  from {
    opacity: 0;
  }
}

.zona {
  fill: var(--fento);
  stroke: var(--papel);
  stroke-width: 1.5;
}

/* As comarcas sen citas quedan ocas e non brancas: o mapa ten que deixar ver
   que a comarca existe e que alí non consta a ave, non facela desaparecer. */
.zona--baleira {
  fill: var(--bretema);
  stroke: var(--borde);
}

.onde {
  fill: var(--papo);
  stroke: var(--tinta);
  stroke-width: 2;
}

.pé {
  margin-top: 0.8rem;
}

/* `.boton--suave` vén de base.css; aquí só o cursor de espera. */
.botón:disabled {
  cursor: progress;
}

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

.nota {
  margin: 0.6rem 0 0;
  padding: 0.6rem 0.75rem;
  background: var(--fento-tenue);
  border-radius: var(--raio);
  font-size: 0.9rem;
  color: var(--tinta);
  text-wrap: pretty;
  animation: revela 260ms ease-out both;
}

.nota__matiz {
  color: var(--tinta-suave);
}

/* Non é un erro nin un oco por cargar: é un dato que non existe. Dise sen
   caixa de alerta, en texto secundario. */
.sen-datos {
  margin: 0;
  color: var(--tinta-suave);
  font-size: 0.9rem;
  text-wrap: pretty;
}

/* Chincheta debuxada, non o emoji 📍: cada sistema pintábao coas súas cores
   —vermello e branco— dentro dun botón verde. */
.chincheta {
  width: 1.05em;
  height: 1.05em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
  flex: none;
}
</style>
