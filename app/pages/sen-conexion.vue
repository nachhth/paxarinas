<script setup lang="ts">
import type { MotivoOmision } from '~/composables/usePrecargaSon'

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

/**
 * Por que non vai baixar soa, se é o caso. Non é un detalle técnico de adorno:
 * a promesa desta páxina é que non se gastan os datos de ninguén, e en Firefox e
 * Safari —que non din nada da conexión— iso significa non baixar nada. Se non se
 * dixese aquí, quedaría un «báixase só» que non se cumpre e un botón que parece
 * redundante.
 */
const motivoPrecarga = ref<MotivoOmision | null>(null)

/**
 * O modelo de son ten botón propio e non entra no de arriba.
 *
 * A queixa que o motivou: alguén premía «Descargar todo para uso sen conexión»,
 * a páxina dicía «uns 38 MB» e despois `/escoitar` seguía pedindo o modelo. Non
 * era mentira por pouco: `useDescargaOffline` baixa fotos e cantos e nunca
 * baixou o modelo. Xuntalos nun só botón tampouco valía —son 49 MB fronte a 38,
 * e hai quen nunca vai usar o identificador polo son—, así que van separados e
 * cada un di o que pesa.
 */
type EstadoModelo = 'comprobando' | 'ausente' | 'baixando' | 'feito' | 'erro' | 'sen-sw'
const modeloEstado = ref<EstadoModelo>('comprobando')
const modeloFeitos = ref(0)
const modeloTotal = ref(0)
const modeloBytes = ref(0)
const modeloCancelado = ref(false)
const modeloPct = computed(() =>
  modeloTotal.value ? Math.round((modeloFeitos.value / modeloTotal.value) * 100) : 0)

async function revisaModelo() {
  modeloEstado.value = await modeloNoDispositivo() ? 'feito' : 'ausente'
}

async function baixarModelo() {
  if (modeloEstado.value === 'baixando') return
  if (!navigator.serviceWorker?.controller) { modeloEstado.value = 'sen-sw'; return }
  modeloCancelado.value = false
  modeloFeitos.value = 0
  modeloBytes.value = 0
  modeloEstado.value = 'baixando'
  // Sen isto o navegador pode tirar os 49 MB en canto lle apete o espazo.
  try { await navigator.storage?.persist?.() } catch { /* opcional */ }
  try {
    await baixaModelo(
      (feitos, total, bytes) => {
        modeloFeitos.value = feitos; modeloTotal.value = total; modeloBytes.value = bytes
      },
      () => !modeloCancelado.value,
    )
    modeloEstado.value = 'feito'
  } catch {
    // Cancelar non é fallar: o que quedou baixado segue na caché e ao volver a
    // premer non se pide outra vez.
    modeloEstado.value = modeloCancelado.value ? 'ausente' : 'erro'
  }
  usado.value = await espazoUsado()
}

onMounted(async () => {
  usado.value = await espazoUsado()
  precargaSonActiva.value = preferenciaPrecarga() === 'auto'
  motivoPrecarga.value = motivoOmision()
  await revisaModelo()
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
        Se vas a un sitio sen cobertura, báixao todo agora, con wifi. Son dúas
        descargas separadas: as <strong>fotos e os cantos</strong>, e aparte o
        <strong>modelo que identifica polo son</strong>, que pesa máis ca todo o
        demais xunto.
      </p>
    </section>

    <section class="bloque">
      <h2>Fotos e cantos</h2>
      <dl class="datos">
        <dt>Fotos grandes</dt>
        <dd>{{ fotos }}</dd>
        <dt>Cantos</dt>
        <dd>{{ cantos }}</dd>
        <dt>Ficheiros en total</dt>
        <dd>{{ total }}</dd>
        <dt>Espazo aproximado</dt>
        <dd>uns 38 MB, sen o modelo de son</dd>
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
        <!-- Antes dicía «Descargar todo», e non era todo: o modelo de son
             quedaba fóra e despois /escoitar seguía pedíndoo. -->
        <button class="boton" @click="descargar">
          Descargar as fotos e os cantos ({{ total }} ficheiros)
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

    <section class="bloque">
      <h2>Identificación polo son</h2>
      <p>
        O modelo que recoñece os cantos son <strong>49 MB</strong>, e
        <strong>non entran na descarga de arriba</strong>: pesan máis ca as
        fotos e os cantos xuntos, e hai quen nunca vai usar o identificador.
      </p>
      <p>
        Para que estea listo cando o precises, pode baixarse só en segundo plano
        despois de abrir a app — pero <strong>só se o navegador confirma que a
        conexión é boa e non medida</strong>. Se non o pode confirmar, non se
        baixa nada: quedas ti co botón.
      </p>

      <!-- Todo isto le a Cache API e a preferencia gardada, que no prerender
           non existen: fóra de <ClientOnly> a hidratación non cadraría. -->
      <ClientOnly>
        <label class="check">
          <input v-model="precargaSonActiva" type="checkbox">
          Baixar o modelo de son automaticamente
        </label>

        <p v-if="precargaSonActiva && motivoPrecarga && modeloEstado !== 'feito'" class="nota">
          <template v-if="motivoPrecarga === 'descoñecida'">
            Este navegador non deixa saber se estás en wifi ou en datos, así que
            <strong>agora mesmo non se vai baixar soa</strong>. Se estás en wifi,
            báixao co botón de aquí abaixo.
          </template>
          <template v-else-if="motivoPrecarga === 'aforro'">
            Tes o aforro de datos activado, así que non se vai baixar soa.
          </template>
          <template v-else-if="motivoPrecarga === 'datos'">
            Estás con datos móbiles, así que non se vai baixar soa. Agarda a ter
            wifi ou báixao co botón, se che dá igual gastalos.
          </template>
          <template v-else>
            A conexión de agora é lenta de máis para baixala soa.
          </template>
        </p>

        <p v-if="modeloEstado === 'comprobando'" class="nota">
          Mirando se xa o tes…
        </p>

        <p v-else-if="modeloEstado === 'feito'" class="aviso aviso--ben">
          O modelo xa está no teu dispositivo. <NuxtLink to="/escoitar">Identificar
          polo son</NuxtLink> funciona sen conexión e non volverá pedircho.
        </p>

        <div v-else-if="modeloEstado === 'baixando'">
          <div
            class="barra" role="progressbar"
            :aria-valuenow="modeloPct" aria-valuemin="0" aria-valuemax="100"
            :aria-label="`Descargando o modelo de son: ${modeloPct}%`"
          >
            <div class="barra__feito" :style="{ width: `${modeloPct}%` }" />
          </div>
          <p class="progreso">
            <span class="progreso__pct">{{ modeloPct }}%</span>
            {{ modeloFeitos }} de {{ modeloTotal }} · {{ formatoMB(modeloBytes) }}
          </p>
          <button class="boton boton--suave" @click="modeloCancelado = true">Cancelar</button>
        </div>

        <template v-else>
          <button class="boton" @click="baixarModelo">
            Baixar tamén o modelo de son (49 MB)
          </button>
          <p v-if="modeloEstado === 'erro'" class="aviso">
            A descarga do modelo quedou a medias. Podes volver premer: o que xa
            está no dispositivo non se baixa outra vez.
          </p>
          <p v-else-if="modeloEstado === 'sen-sw'" class="aviso">
            Non hai service worker activo, así que non habería onde gardar o
            modelo. Recarga a páxina e ténteo de novo.
          </p>
        </template>
      </ClientOnly>

      <p class="nota">
        Se apagas a descarga automática, o modelo segue estando dispoñible:
        baixarase cando entres en
        <NuxtLink to="/escoitar">identificar polo son</NuxtLink> e o pidas.
      </p>
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
