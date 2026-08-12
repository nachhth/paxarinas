<script setup lang="ts">
const catalogo = useCatalogo()

useHead({ title: 'Uso sen conexión — Paxariñas' })

const {
  estado, feitos, fallos, bytes, total, porcentaxe, descargar, cancelar,
} = useDescargaOffline(catalogo.especies)

const fotos = computed(() => catalogo.especies.filter(e => e.foto).length)
const cantos = computed(() => catalogo.especies.filter(e => e.canto).length)

const usado = ref<number | null>(null)
onMounted(async () => { usado.value = await espazoUsado() })

// Refréscase ao rematar, para que se vexa canto ocupa xa a app.
watch(estado, async (v) => {
  if (v === 'feito' || v === 'erro') usado.value = await espazoUsado()
})
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">← Todas as aves</NuxtLink>
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
      <dl class="datos">
        <dt>Fotos grandes</dt>
        <dd>{{ fotos }}</dd>
        <dt>Cantos</dt>
        <dd>{{ cantos }}</dd>
        <dt>Ficheiros en total</dt>
        <dd>{{ total }}</dd>
        <dt>Espazo aproximado</dt>
        <dd>uns 38 MB</dd>
        <dt v-if="usado !== null">A app ocupa agora</dt>
        <dd v-if="usado !== null">{{ formatoMB(usado) }}</dd>
      </dl>
    </section>

    <section class="bloque">
      <div v-if="estado === 'descargando'">
        <div
          class="barra" role="progressbar"
          :aria-valuenow="porcentaxe" aria-valuemin="0" aria-valuemax="100"
          :aria-label="`Descargando: ${porcentaxe}%`"
        >
          <div class="barra__feito" :style="{ width: `${porcentaxe}%` }" />
        </div>
        <p class="progreso">
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
.volver {
  font-size: 0.9rem;
  text-decoration: none;
}

.bloque {
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}

.bloque p {
  margin: 0 0 0.6rem;
}

.bloque p:last-child {
  margin-bottom: 0;
}

.datos {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  margin: 0;
}

.datos dt {
  color: var(--tinta-suave);
}

.datos dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.boton {
  min-height: 2.75rem;
  padding: 0.6rem 1.1rem;
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--fento);
  border: none;
  border-radius: var(--raio);
  cursor: pointer;
}

.boton--suave {
  background: transparent;
  color: var(--tinta-suave);
  border: 1px solid var(--borde);
  font-weight: 400;
}

.barra {
  height: 0.6rem;
  background: var(--bretema);
  border-radius: 999px;
  overflow: hidden;
}

.barra__feito {
  height: 100%;
  background: var(--fento);
  transition: width 0.2s linear;
}

.progreso {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--tinta-suave);
  font-variant-numeric: tabular-nums;
}

.aviso {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--toxo);
  border-radius: 0 var(--raio) var(--raio) 0;
  font-size: 0.9rem;
}

.aviso--ben {
  border-left-color: var(--fento);
}
</style>
