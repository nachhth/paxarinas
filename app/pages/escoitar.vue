<script setup lang="ts">
import { nomeMostrado } from '~/composables/useCatalogo'
import { useBirdnet, BYTES_MODELO } from '~/composables/useBirdnet'

/**
 * Esta pantalla vai sempre en escuro, sexa o que sexa o tema do sistema.
 *
 * Non se duplica nin unha cor: `data-tema="escuro"` activa o bloque de tokens
 * que xa existe en base.css, así que a cabeceira, as tarxetas, os avisos e a
 * barra de abaixo cambian todos sos. `useHead` quítao ao saír da ruta.
 *
 * Por que escuro e non seguindo o tema: úsase de noite e ao amencer, cando
 * cantan os paxaros, e cunha pantalla branca na man non se ve nin o paxaro nin
 * a pantalla. É a única ruta da app que decide o tema pola persoa, e faino por
 * onde se usa.
 */
useHead({
  title: 'Escoitar — Paxariñas',
  htmlAttrs: { 'data-tema': 'escuro' },
})

const {
  estado, erro, progreso, bytesBaixados, backend, gpu,
  deteccions, segundosGravados, msAnalise, espazoLibre, daCache, senGardar, niveis,
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

/**
 * A confianza en palabras. A cifra segue aí ao lado: a palabra é para decidir
 * nun segundo co paxaro diante, e o número para quen queira saber canto.
 *
 * Non se di nunca «é», nin sequera co 99%: o modelo dá probabilidades e a app
 * enteira está construída sobre non afirmar o que non sabe.
 */
function enPalabras(c: number) {
  if (c >= 0.7) return 'moi probable'
  if (c >= 0.35) return 'probable'
  return 'posible'
}
const podeGravar = computed(() => estado.value === 'listo')
const analizado = ref(false)

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`
const pct = computed(() => Math.round(progreso.value * 100))

/** Non chega o espazo declarado polo navegador para os 51 MB? */
const senEspazo = computed(() =>
  espazoLibre.value !== null && espazoLibre.value < BYTES_MODELO * 1.2)

onMounted(comprobar)

/**
 * `analizado` só se marca se se analizou algo de verdade: un permiso denegado ou
 * unha gravación curta de máis xa din o seu na súa mensaxe de erro, e sen isto
 * pintábase tamén «non se recoñeceu ningunha especie, proba a achegarte».
 */
async function aoGravar() {
  analizado.value = false
  analizado.value = await gravar(segundos.value, soDoMes.value, soHabituais.value)
}
</script>

<template>
  <div>
    <NuxtLink to="/" class="volver">Todas as aves</NuxtLink>

    <!-- Sen tarxeta: é a entrada da pantalla, non un dato máis. -->
    <header class="entrada">
      <h1 class="entrada__titulo">Escoitando o monte</h1>
      <p class="entrada__pe">
        O son <strong>non sae do teléfono</strong>: o modelo corre aquí dentro,
        sen cobertura e sen enviar nada.
      </p>
      <p class="entrada__aviso">
        Isto é unha axuda, non unha determinación. Confirma sempre co que vexas
        e coa ficha da especie.
      </p>
    </header>

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
      <!-- ─── Comprobación ──────────────────────────────────────────────────── -->
      <!-- `inicial` dura o que tarda en responder o adaptador de WebGPU e en
           mirar a caché. Antes aquí ofrecíase xa a descarga, e a quen xa tiña o
           modelo pedíanselle 49 MB durante ese intre; agora dise o que se está
           a facer, que é curto e non mente. -->
      <section v-if="estado === 'inicial'" class="bloque">
        <h2>Identificación polo son</h2>
        <p class="nota">Comprobando o dispositivo…</p>
      </section>

      <!-- ─── Descarga ou preparación do modelo ─────────────────────────────── -->
      <section
        v-else-if="['sen-modelo', 'cargando', 'erro'].includes(estado)"
        class="bloque"
      >
        <template v-if="daCache">
          <h2>Preparando o modelo</h2>
          <p>
            O modelo <strong>xa está no teu dispositivo</strong>: isto non baixa
            nada, só o pon a punto na tarxeta gráfica. Tarda uns segundos.
          </p>
        </template>

        <template v-else>
          <h2>Primeiro hai que baixar o modelo</h2>
          <p>
            O identificador usa <strong>BirdNET</strong>, do Cornell Lab of
            Ornithology. Son <strong>{{ mb(BYTES_MODELO) }}</strong> que
            <em>non</em> se descargan ao instalar a app: só cando os pides aquí.
            Bótalle wifi.
          </p>
          <!-- Só se é verdade: sen service worker activo non queda gardado, e
               prometelo era o que facía que a app pedise os mesmos 49 MB unha e
               outra vez sen explicar nada. -->
          <p v-if="!senGardar" class="nota">
            Queda gardado no dispositivo, así que isto é unha vez soa. Despois
            funciona sen conexión, e ao volver a esta páxina xa non se pide.
          </p>

          <p v-else class="aviso">
            <strong>Agora mesmo non quedaría gardado.</strong> A app aínda se
            está instalando neste dispositivo, así que estes {{ mb(BYTES_MODELO) }}
            servirían só para esta vez e volverían pedirse ao regresar. Recarga a
            páxina nuns segundos e o botón xa deixará o modelo posto para sempre.
          </p>

          <p v-if="senEspazo" class="aviso">
            O navegador di que só quedan {{ mb(espazoLibre ?? 0) }} libres. Pode
            que a descarga non caiba.
          </p>
        </template>

        <div v-if="estado === 'cargando'">
          <div
            class="barra" role="progressbar"
            :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"
            :aria-label="daCache ? `Preparando o modelo: ${pct}%` : `Descargando o modelo: ${pct}%`"
          >
            <div class="barra__feito" :style="{ width: `${pct}%` }" />
          </div>
          <p class="progreso">
            <span class="progreso__pct">{{ pct }}%</span>
            <template v-if="!daCache">
              {{ mb(bytesBaixados) }} de {{ mb(BYTES_MODELO) }}
            </template>
          </p>
        </div>

        <template v-else>
          <!-- A etiqueta segue ao estado e non é fixa: dicir «Baixar o modelo
               (49 MB)» debaixo dun «xa está no teu dispositivo» é contarlle á
               xente dúas cousas distintas no mesmo sitio. -->
          <button class="boton boton--baixar" @click="cargar">
            <template v-if="daCache">Preparar o modelo</template>
            <template v-else-if="estado === 'erro'">
              Tentalo de novo ({{ mb(BYTES_MODELO) }})
            </template>
            <template v-else>Baixar o modelo ({{ mb(BYTES_MODELO) }})</template>
          </button>
          <p v-if="estado === 'erro' && erro" class="aviso">
            Non se puido cargar: {{ erro }}
          </p>
        </template>
      </section>

      <!-- ─── Gravación ─────────────────────────────────────────────────────── -->
      <!-- `erro` tamén queda fóra, e non só os estados previos: se o modelo non
           cargou, aquí non hai nada que gravar. Amosábase o bloque enteiro co
           botón inhabilitado debaixo do «Primeiro hai que baixar o modelo», e o
           mesmo erro pintábase dúas veces, unha en cada sección. -->
      <section
        v-if="!['inicial', 'sen-modelo', 'cargando', 'erro'].includes(estado)"
        class="bloque"
      >
        <h2>Gravar</h2>

        <div class="controis">
          <!-- Tres botóns e non un despregable. Un `select` nativo canta
               dentro dunha tarxeta —é o único control da app que se pinta co
               estilo do sistema— e para tres valores obriga a dous toques
               (abrir e escoller) cando se pode facer nun.
               Fóra os 15 s: estaban entre 9 e 30 sen engadir nada. -->
          <!-- `role=group` + `aria-label` en vez de `fieldset`/`legend`: dá a
               mesma semántica e déixase aliñar en fila. Un `legend` dentro dun
               `fieldset` en flex colócao cada navegador á súa maneira. -->
          <div class="duracion" role="group" aria-label="Duración">
            <span class="duracion__rotulo">Duración</span>
            <div class="duracion__opcions">
              <button
                v-for="s in [3, 9, 30]" :key="s"
                class="duracion__boton" :class="{ 'duracion__boton--posto': segundos === s }"
                :aria-pressed="segundos === s" :disabled="!podeGravar"
                @click="segundos = s"
              >
                {{ s }} s
              </button>
            </div>
          </div>

          <label class="opcion">
            <input v-model="soDoMes" type="checkbox" :disabled="!podeGravar">
            <span>Só as que se ven en {{ MESES[mesActual] }}</span>
          </label>

          <label class="opcion">
            <input v-model="soHabituais" type="checkbox" :disabled="!podeGravar">
            <span>Deixar fóra raras e divagantes</span>
          </label>
        </div>

        <!-- ─── A onda ───────────────────────────────────────────────────────
             Barras co nivel REAL do micrófono, non unha animación decorativa.
             Se non entra son, quedan planas — e iso é precisamente o que hai
             que poder ver.

             Está SEMPRE no seu sitio, apagada mentres non se grava. Aparecendo
             só ao premer, empurraba o botón e todo o de abaixo no mesmo instante
             en que se pousa o dedo: o peor momento posible para mover nada. -->
        <div
          class="onda" :class="{ 'onda--acesa': estado === 'gravando' }"
          role="img"
          :aria-label="estado === 'gravando' ? 'Nivel do micrófono' : 'Micrófono apagado'"
        >
          <span
            v-for="(n, i) in niveis" :key="i" class="onda__barra"
            :style="{ height: `${Math.max(6, n * 100)}%` }"
          />
        </div>

        <!-- ─── O botón de gravar ────────────────────────────────────────────
             Redondo e grande, coa onda animada arredor mentres colle son.
             Prémese cun paxaro cantando enriba e a miúdo sen mirar, así que non
             pode ser un botón de formulario máis. -->
        <div class="gravar">
          <button
            v-if="estado === 'gravando'"
            class="gravar__boton gravar__boton--activo"
            @click="parar"
          >
            <!-- Cadrado de parar. Antes había aquí unhas barras animadas, pero
                 repetían a onda que xa está enriba —e esa si mide o micrófono—,
                 así que dentro do botón non dicían nada novo. Un cadrado di
                 «para», que é o que fai. -->
            <span class="gravar__stop" aria-hidden="true" />
            <span class="só-lectores">Parar de gravar</span>
          </button>

          <button
            v-else class="gravar__boton"
            :disabled="!podeGravar" @click="aoGravar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
            </svg>
            <span class="só-lectores">Gravar e identificar</span>
          </button>

          <p class="gravar__pe" aria-live="polite">
            <template v-if="estado === 'gravando'">
              Gravando · {{ segundosGravados.toFixed(0) }} s — toca para deter
            </template>
            <template v-else-if="estado === 'analizando'">Analizando…</template>
            <template v-else>Toca e deixa que cante</template>
          </p>
        </div>

        <p v-if="erro" class="aviso">{{ erro }}</p>

        <!-- Debaixo do botón: explica por que isto funciona, pero non fai falta
             lelo para gravar. O número é o que xustifica todo: 6.522 → uns
             centos. -->
        <p class="nota nota--pe">
          BirdNET coñece <strong>6.522</strong> especies de todo o mundo. Cos
          filtros postos compáranse só <strong>{{ nCandidatas }}</strong>, as que
          teñen citas en Galicia. Iso é o que dá as boas respostas.
        </p>
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
                <span
                  class="deteccion__palabra"
                  :class="{ 'deteccion__palabra--forte': d.confianza >= 0.7 }"
                >{{ enPalabras(d.confianza) }}</span>
                <span class="deteccion__pct">{{ Math.round(d.confianza * 100) }}%</span>
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
/* ─── Duración ──────────────────────────────────────────────────────────────
   Control segmentado: as tres opcións á vista e un só toque para cambiar. */
/* Rótulo e botóns na mesma liña. Se non cabe —pantalla moi estreita ou letra
   grande do sistema— o `wrap` déixao caer debaixo en vez de apertalo. */
.duracion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.duracion__rotulo {
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.duracion__opcions {
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tinta) 5%, var(--papel));
}

.duracion__boton {
  min-width: 3.2rem;
  min-height: 38px;
  padding: 0 0.7rem;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--tinta-suave);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--saída), color var(--saída);
}

.duracion__boton:hover:not(:disabled):not(.duracion__boton--posto) {
  color: var(--fento);
}

/* A escollida. `aria-pressed` xa o di ás axudas técnicas; isto é para os ollos. */
.duracion__boton--posto {
  background: var(--fento);
  color: var(--boton-tinta);
}

.duracion__boton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.duracion__boton:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 1px;
}

/* ─── Entrada da pantalla ───────────────────────────────────────────────────
   Sen tarxeta: é o título da pantalla, non un dato. */
.entrada {
  margin: 0 0 var(--oco);
}

.entrada__titulo {
  margin: 0;
  font-size: clamp(1.6rem, 1.2rem + 2vw, 2rem);
  line-height: 1.15;
}

.entrada__pe {
  margin: 0.35rem 0 0;
  max-width: 22rem;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--tinta-suave);
}

.entrada__aviso {
  margin: 0.6rem 0 0;
  font-size: 0.82rem;
  color: var(--granito);
}

/* ─── Onda do micrófono ─────────────────────────────────────────────────────
   Alto fixo para que non salte a páxina ao aparecer, e as barras crecen desde
   abaixo. A cor sae dos tokens: en escuro é o verde claro do tema. */
.onda {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  /* Alto fixo, reservado sempre. É o que evita o salto ao premer. */
  height: 76px;
  margin: 1.4rem 0 0.6rem;
}

.onda__barra {
  width: 6px;
  border-radius: 4px;
  /* Apagada: gris e a penas visible. Plana quere dicir «non entra son», así que
     tampouco pode desaparecer de todo. */
  background: var(--granito);
  opacity: 0.35;
  transition: height 90ms linear, background var(--saída), opacity var(--saída);
}

.onda--acesa .onda__barra {
  background: var(--fento);
  opacity: 1;
}

/* ─── Confianza en palabras ─────────────────────────────────────────────────
   A palabra manda e a cifra vai debaixo, menor: co paxaro diante decídese coa
   palabra, e o número queda para quen queira comprobar. */
.deteccion__palabra {
  display: block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--borde);
  background: color-mix(in srgb, var(--tinta) 6%, transparent);
  color: var(--tinta-suave);
  font-size: 0.72rem;
  font-weight: 650;
  white-space: nowrap;
}

.deteccion__palabra--forte {
  border-color: color-mix(in srgb, var(--fento) 40%, transparent);
  background: color-mix(in srgb, var(--fento) 16%, transparent);
  color: var(--fento);
}

.deteccion__pct {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--granito);
  text-align: center;
}

/* ─── Botón de gravar ───────────────────────────────────────────────────────
   Círculo grande e centrado. Mentres grava, as barras móvense: é o único xeito
   de saber que o micrófono colle algo sen ter que fiarse. */
.gravar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.4rem;
}

/* A nota vai ao final e en pequeno: está para quen queira sabelo, non no
   camiño de quen quere gravar. */
.nota--pe {
  margin-top: 1.1rem;
  font-size: 0.8rem;
}

.gravar__boton {
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: var(--fento);
  color: var(--boton-tinta);
  cursor: pointer;
  box-shadow: 0 2px 6px rgb(26 31 22 / 20%), 0 12px 28px rgb(26 31 22 / 22%);
  transition: transform var(--saída), background var(--saída);
}

.gravar__boton:hover:not(:disabled) {
  background: var(--fento-claro);
}

.gravar__boton:active:not(:disabled) {
  transform: scale(0.95);
}

.gravar__boton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gravar__boton:focus-visible {
  outline: 3px solid var(--foco);
  outline-offset: 3px;
}

.gravar__boton svg {
  width: 38px;
  height: 38px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

/* Gravando: cambia a cor e o círculo late, para que se vexa de lonxe que segue
   collendo son. */
.gravar__boton--activo {
  background: var(--papo);
  color: #1a1f16;
}

/* Cadrado de parar, coas esquinas redondeadas como o resto da app. */
.gravar__stop {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: currentColor;
}

.gravar__pe {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--tinta-suave);
  text-align: center;
}



/* `.volver`, `.bloque`, `.boton`, `.aviso` e `.nota` veñen de base.css.
   A barra de progreso non: repítese aquí a mesma que usa /sen-conexion. */

/* O botón viña pegado ao parágrafo de enriba: `.boton` non trae marxe propia
   porque na maioría dos sitios vai nunha fila con outros. Aquí é o remate dun
   bloque de texto e precisa aire. */
.boton--baixar {
  margin-top: 0.9rem;
}

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
  font-family: var(--fonte-titulo);
  font-size: 0.84rem;
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
