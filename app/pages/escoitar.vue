<script setup lang="ts">
import { nomeMostrado } from '~/composables/useCatalogo'
import { useBirdnet, BYTES_MODELO } from '~/composables/useBirdnet'

useHead({ title: 'Escoitar — Paxariñas' })

const {
  estado, erro, progreso, bytesBaixados, backend, gpu,
  deteccions, segundosGravados, msAnalise, espazoLibre,
  comprobar, cargar, gravar, parar, candidatas, totalGalegas, mesActual,
} = useBirdnet()

/** Por defecto acótase ao mes en curso: é o que fai que a lista sexa curta. */
const soDoMes = ref(true)
const soHabituais = ref(true)
const segundos = ref(9)
/** Só se amosa o que pasa dun 10%; por baixo diso é ruído do modelo. */
const LIMIAR = 0.1

const MESES = [
  'xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro',
]

// `candidatas()` non é reactiva (le un Map interno), así que se recalcula
// explicitamente cando cambia algún filtro ou cando o modelo remata de cargar.
const nCandidatas = ref(0)
watchEffect(() => {
  // Referéncianse para que o efecto se rearme ao cambiar calquera das tres.
  void soDoMes.value; void soHabituais.value; void totalGalegas.value
  nCandidatas.value = candidatas(soDoMes.value, soHabituais.value)
})

const atopadas = computed(() => deteccions.value.filter(d => d.confianza >= LIMIAR))
const podeGravar = computed(() => estado.value === 'listo')
const analizado = ref(false)

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`
const pct = computed(() => Math.round(progreso.value * 100))

/** Non chega o espazo declarado polo navegador para os 51 MB? */
const senEspazo = computed(() =>
  espazoLibre.value !== null && espazoLibre.value < BYTES_MODELO * 1.2)

onMounted(comprobar)

async function aoGravar() {
  analizado.value = false
  await gravar(segundos.value, soDoMes.value, soHabituais.value)
  analizado.value = true
}
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>
    <h1>Escoitar</h1>

    <section class="bloque">
      <p>
        Grava uns segundos e a app dirache que aves cre que están a cantar.
        Todo se calcula <strong>no teu dispositivo</strong>: o son non sae de
        aquí e non fai falta cobertura.
      </p>
      <p class="nota">
        Isto é unha axuda, non unha determinación. Confirma sempre co que vexas
        e coa ficha da especie.
      </p>
    </section>

    <!-- ─── Sen GPU non hai nada que facer: dise, non se deixa a pantalla morta ─ -->
    <section v-if="estado === 'sen-gpu'" class="bloque">
      <h2>Aquí non pode funcionar</h2>
      <p class="aviso">
        Este navegador non ten <strong>WebGL</strong> nin <strong>WebGPU</strong>,
        e a rede neuronal de BirdNET precisa un dos dous para correr. Non hai un
        modo lento alternativo: sen aceleración gráfica tardaría minutos por cada
        tres segundos de son.
      </p>
      <p>
        Adoita pasar con navegadores moi antigos, con máquinas virtuais e cando
        a aceleración por hardware está desactivada nas opcións do navegador.
        O resto da app —as fichas, os nomes, os mapas e os cantos— funciona
        igual.
      </p>
    </section>

    <template v-else>
      <!-- ─── Descarga do modelo ────────────────────────────────────────────── -->
      <!-- `inicial` entra aquí a propósito: comprobar se hai GPU é asíncrono
           (hai que pedirlle o adaptador a WebGPU) e, se non, a páxina quedaría
           un instante en branco. Se resultase non haber GPU, `cargar()`
           vólveo comprobar antes de baixar nada. -->
      <section
        v-if="['inicial', 'sen-modelo', 'cargando', 'erro'].includes(estado)"
        class="bloque"
      >
        <h2>Primeiro hai que baixar o modelo</h2>
        <p>
          O identificador usa <strong>BirdNET</strong>, do Cornell Lab of
          Ornithology. Son <strong>{{ mb(BYTES_MODELO) }}</strong> que
          <em>non</em> se descargan ao instalar a app: só cando os pides aquí.
          Bótalle wifi.
        </p>
        <p class="nota">
          Queda gardado no dispositivo, así que isto é unha vez soa. Despois
          funciona sen conexión.
        </p>

        <p v-if="senEspazo" class="aviso">
          O navegador di que só quedan {{ mb(espazoLibre ?? 0) }} libres. Pode
          que a descarga non caiba.
        </p>

        <div v-if="estado === 'cargando'">
          <div
            class="barra" role="progressbar"
            :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"
            :aria-label="`Descargando o modelo: ${pct}%`"
          >
            <div class="barra__feito" :style="{ width: `${pct}%` }" />
          </div>
          <p class="progreso">
            <span class="progreso__pct">{{ pct }}%</span>
            {{ mb(bytesBaixados) }} de {{ mb(BYTES_MODELO) }}
          </p>
        </div>

        <template v-else>
          <button class="boton" @click="cargar">
            Baixar o modelo ({{ mb(BYTES_MODELO) }})
          </button>
          <p v-if="estado === 'erro' && erro" class="aviso">
            Non se puido cargar: {{ erro }}
          </p>
        </template>
      </section>

      <!-- ─── Gravación ─────────────────────────────────────────────────────── -->
      <section
        v-if="!['inicial', 'sen-modelo', 'cargando'].includes(estado)"
        class="bloque"
      >
        <h2>Gravar</h2>

        <div class="controis">
          <label class="campo">
            <span>Duración</span>
            <select v-model.number="segundos" :disabled="!podeGravar">
              <option :value="3">3 segundos</option>
              <option :value="9">9 segundos</option>
              <option :value="15">15 segundos</option>
              <option :value="30">30 segundos</option>
            </select>
          </label>

          <label class="opcion">
            <input v-model="soDoMes" type="checkbox" :disabled="!podeGravar">
            <span>Só as que se ven en {{ MESES[mesActual] }}</span>
          </label>

          <label class="opcion">
            <input v-model="soHabituais" type="checkbox" :disabled="!podeGravar">
            <span>Deixar fóra raras e divagantes</span>
          </label>
        </div>

        <!-- O número que xustifica todo isto: 6.522 → uns centos. -->
        <p class="nota">
          BirdNET coñece <strong>6.522</strong> especies de todo o mundo. Cos
          filtros postos compáranse só <strong>{{ nCandidatas }}</strong>, as que
          teñen citas en Galicia. Iso é o que dá as boas respostas.
        </p>

        <button
          v-if="estado === 'gravando'"
          class="boton boton--suave" @click="parar"
        >
          Parar ({{ segundosGravados.toFixed(0) }} s)
        </button>
        <button
          v-else class="boton"
          :disabled="!podeGravar" @click="aoGravar"
        >
          <template v-if="estado === 'analizando'">Analizando…</template>
          <template v-else>Gravar e identificar</template>
        </button>

        <p v-if="erro" class="aviso">{{ erro }}</p>
      </section>

      <!-- ─── Resultados ────────────────────────────────────────────────────── -->
      <section v-if="analizado && estado === 'listo'" class="bloque">
        <h2>O que se escoitou</h2>

        <p v-if="!atopadas.length" class="aviso">
          Non se recoñeceu ningunha especie con confianza abonda. Proba a
          achegarte, a gravar máis tempo ou nun momento con menos vento.
        </p>

        <ul v-else class="deteccions">
          <li v-for="d in atopadas" :key="d.especie.slug">
            <NuxtLink :to="`/especie/${d.especie.slug}`" class="deteccion">
              <img
                v-if="d.especie.foto" :src="d.especie.foto.mini"
                :alt="`Foto de ${nomeMostrado(d.especie)}`"
                class="deteccion__foto" width="56" height="56" loading="lazy"
              >
              <span v-else class="deteccion__foto deteccion__foto--baleira" aria-hidden="true" />

              <span class="deteccion__nomes">
                <strong>{{ nomeMostrado(d.especie) }}</strong>
                <em>{{ d.especie.cientifico }}</em>
                <span v-if="!d.noMes" class="deteccion__nota">
                  sen citas galegas en {{ MESES[mesActual] }}
                </span>
              </span>

              <span class="deteccion__conf" :title="`Segundo ${d.segundo}`">
                {{ Math.round(d.confianza * 100) }}%
              </span>
            </NuxtLink>
          </li>
        </ul>

        <p class="nota">
          Analizado en {{ Math.round(msAnalise) }} ms
          <template v-if="backend"> · {{ backend }}<template v-if="gpu"> ({{ gpu }})</template></template>
        </p>
      </section>

      <!-- ─── Atribución: obrigación de licenza, non un adorno ───────────────── -->
      <section class="bloque creditos">
        <h2>De onde sae isto</h2>
        <p>
          Modelo <strong>BirdNET</strong> GLOBAL 6K v2.4, de Stefan Kahl,
          Connor M. Wood, Maximilian Eibl e Holger Klinck
          (<a href="https://birdnet.cornell.edu/" rel="noopener">K. Lisa Yang
          Center for Conservation Bioacoustics, Cornell Lab of Ornithology</a>),
          baixo licenza
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noopener">CC&nbsp;BY-NC-SA&nbsp;4.0</a>.
          Paxariñas non ten ánimo de lucro nin publicidade.
        </p>
        <p class="nota">
          O modelo tomouse da conversión oficial a TensorFlow.js do repositorio
          <a href="https://github.com/birdnet-team/BirdNET-Analyzer" rel="noopener">birdnet-team/BirdNET-Analyzer</a>
          (código MIT) e modificouse para que reciba o espectrograma xa
          calculado. O mel-espectrograma calcúlao esta app.
          <a href="https://tensorflow.org/js" rel="noopener">TensorFlow.js</a>,
          Apache-2.0.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* `.volver`, `.bloque`, `.boton`, `.aviso` e `.nota` veñen de base.css.
   A barra de progreso non: repítese aquí a mesma que usa /sen-conexion. */

.bloque p {
  max-width: 44rem;
  text-wrap: pretty;
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

.progreso__pct {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--tinta);
  letter-spacing: -0.02em;
}

.controis {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  margin-bottom: 0.9rem;
}

.campo {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
}

.opcion {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.deteccions {
  list-style: none;
  margin: 0.4rem 0 1rem;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

/* A fila enteira é a ligazón: nun móbil, co dedo, un enlace só no nome é un
   branco pequeno de máis. */
.deteccion {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--tinta) 12%, var(--papel));
  border-radius: var(--raio-g);
  text-decoration: none;
  color: inherit;
}

.deteccion:hover,
.deteccion:focus-visible {
  border-color: var(--fento);
  background: color-mix(in srgb, var(--fento) 6%, var(--papel));
}

.deteccion__foto {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--raio-p);
  flex: none;
}

.deteccion__foto--baleira {
  background: color-mix(in srgb, var(--tinta) 8%, var(--papel));
}

.deteccion__nomes {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}

.deteccion__nomes em {
  font-size: 0.82rem;
  color: var(--tinta-suave);
}

.deteccion__nota {
  font-size: 0.76rem;
  color: var(--tinta-suave);
}

/* Cifra de ancho fixo: nunha lista ordenada por confianza, se baila cústache
   ler cal é maior. */
.deteccion__conf {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 1.05rem;
  flex: none;
}

.creditos {
  font-size: 0.9rem;
}
</style>
