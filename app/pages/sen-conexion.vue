<script setup lang="ts">
const catalogo = useCatalogo()

useHead({ title: 'Uso sen conexión — Paxariñas' })

const {
  estado, feitos, fallos, bytes, total, porcentaxe, descargar, cancelar,
} = useDescargaOffline(catalogo.especies)

const fotos = computed(() => catalogo.especies.filter(e => e.foto).length)
const cantos = computed(() => catalogo.especies.filter(e => e.canto).length)

const usado = ref<number | null>(null)

/** Precarga do modelo de son: baixa soa, agás que se apague aquí. */
const precargaSonActiva = ref(true)
onMounted(async () => {
  usado.value = await espazoUsado()
  precargaSonActiva.value = preferenciaPrecarga() === 'auto'
})
watch(precargaSonActiva, (v) => gardaPreferenciaPrecarga(v ? 'auto' : 'nunca'))

// Refréscase ao rematar, para que se vexa canto ocupa xa a app.
watch(estado, async (v) => {
  if (v === 'feito' || v === 'erro') usado.value = await espazoUsado()
})
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>
    <h1>Uso sen conexión</h1>

    <section class="bloque">
      <p>
        As fichas, os nomes e as miniaturas xa quedan no teu dispositivo ao
        instalar a app. As <strong>fotos grandes</strong> e os
        <strong>cantos</strong> non: gárdanse só segundo os vas abrindo, porque
        precargalos todos faría a instalación inviable con datos móbiles.
      </p>
      <p>
        Se vas a un sitio sen cobertura, báixao todo agora, con wifi.
      </p>
    </section>

    <section class="bloque">
      <h2>O que se baixa</h2>
      <dl class="datos">
        <dt>Fotos grandes</dt>
        <dd>{{ fotos }}</dd>
        <dt>Cantos</dt>
        <dd>{{ cantos }}</dd>
        <dt>Ficheiros en total</dt>
        <dd>{{ total }}</dd>
        <dt>Espazo aproximado</dt>
        <dd>uns 38 MB</dd>
        <dt>A app ocupa agora</dt>
        <!-- Mentres o navegador non responde a `estimate()` non se pon un
             guión: iso diría "cero". Un esqueleto di "aínda non se sabe".
             A bifurcación vai dentro do <dd> e non repetindo <dt>/<dd>: unha
             cadea v-if/v-else non pode saltar por riba doutro elemento. -->
        <dd>
          <template v-if="usado !== null">{{ formatoMB(usado) }}</template>
          <span v-else class="esqueleto esqueleto--liña" />
        </dd>
      </dl>
    </section>

    <section class="bloque">
      <h2>Identificación polo son</h2>
      <p>
        O modelo que recoñece os cantos son <strong>49 MB</strong> aparte. Para
        que estea listo cando o precises, báixase só en segundo plano despois de
        abrir a app — pero <strong>nunca con datos móbiles lentos nin co aforro
        de datos activado</strong>: nesas condicións agarda a que teñas wifi.
      </p>
      <ClientOnly>
        <label class="check">
          <input v-model="precargaSonActiva" type="checkbox">
          Baixar o modelo de son automaticamente
        </label>
      </ClientOnly>
      <p class="nota">
        Se o apagas, segue estando dispoñible: baixarase cando entres en
        <NuxtLink to="/escoitar">identificar polo son</NuxtLink> e o pidas.
      </p>
    </section>

    <section class="bloque">
      <h2>Descarga</h2>
      <div v-if="estado === 'descargando'">
        <div
          class="barra" role="progressbar"
          :aria-valuenow="porcentaxe" aria-valuemin="0" aria-valuemax="100"
          :aria-label="`Descargando: ${porcentaxe}%`"
        >
          <div class="barra__feito" :style="{ width: `${porcentaxe}%` }" />
        </div>
        <p class="progreso">
          <span class="progreso__pct">{{ porcentaxe }}%</span>
          {{ feitos }} de {{ total }} · {{ formatoMB(bytes) }}
          <template v-if="fallos"> · {{ fallos }} fallidos</template>
        </p>
        <button class="boton boton--suave" @click="cancelar">Cancelar</button>
      </div>

      <template v-else>
        <button class="boton" @click="descargar">
          Descargar todo para uso sen conexión
        </button>

        <p v-if="estado === 'feito'" class="aviso aviso--ben">
          Listo. Xa tes as {{ total }} fotos e cantos no dispositivo.
        </p>

        <p v-else-if="estado === 'erro'" class="aviso">
          Descargáronse {{ total - fallos }} de {{ total }}. Quedaron
          {{ fallos }} sen baixar, seguramente por cortes de rede. Podes volver
          premer: os que xa están non se baixan outra vez.
        </p>

        <p v-else-if="estado === 'sen-sw'" class="aviso">
          Non hai service worker activo, así que non habería onde gardar as
          descargas. Isto pasa en desenvolvemento e a primeira vez que abres a
          app: recarga a páxina e ténteo de novo.
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* `.volver`, `.bloque`, `.datos`, `.boton` e `.aviso` veñen de base.css. */

.bloque p {
  max-width: 44rem;
  text-wrap: pretty;
}

.datos dd {
  font-weight: 600;
}

/* Barra de progreso. O carril leva o mesmo redondeo que a parte feita, senón
   ao chegar ao final vense as esquinas cadradas por baixo. */
.barra {
  height: 0.55rem;
  background: color-mix(in srgb, var(--tinta) 9%, var(--papel));
  border-radius: 999px;
  overflow: hidden;
}

.barra__feito {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--fento), var(--fento-claro));
  transition: width 0.25s ease-out;
}

.progreso {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0.6rem 0 0.8rem;
  font-size: 0.88rem;
  color: var(--tinta-suave);
  font-variant-numeric: tabular-nums;
}

/* A porcentaxe é o dato que se mira de esguello mentres baixa: vai grande e
   con ancho de cifra fixo para que non baile. */
.progreso__pct {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--tinta);
  letter-spacing: -0.02em;
}

/* Esqueleto do tamaño dunha liña de texto, para o dato que aínda non chegou. */
.esqueleto--liña {
  display: inline-block;
  width: 4.5rem;
  height: 0.85em;
  vertical-align: -0.1em;
  border-radius: var(--raio-p);
}
</style>
