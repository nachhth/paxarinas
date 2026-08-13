<script setup lang="ts">
const catalogo = useCatalogo()
const zonas = useZonas()
const { estado: estadoUbi, posicion, erro: erroUbi, localiza } = useUbicacion()

useHead({ title: 'Que paxaro é? — Paxariñas' })

const criterios = ref(criteriosBaleiros())
const habitats = habitatsDoCatalogo(catalogo.especies)

/**
 * O mes vai posto de entrada, pero visible e desactivable. É o filtro que máis
 * recorta e o que ninguén pensaría en poñer, así que darllo feito é medio
 * traballo; deixalo oculto sería decidir por el sen que o saiba.
 */
onMounted(() => {
  criterios.value.mes = new Date().getMonth()
})

watch(posicion, (p) => {
  if (!p) return
  const z = zonas.zonas.find(z => dentroDaZona(z, p.lon, p.lat))
  if (z) criterios.value.zona = z.id
})

const zonaEscollida = computed(() =>
  zonas.zonas.find(z => z.id === criterios.value.zona) ?? null)

/** Índices no catálogo das especies citadas na comarca escollida. */
const especiesDaZona = computed(() =>
  zonaEscollida.value ? new Set(zonaEscollida.value.especies) : null)

const resultados = computed(() =>
  filtra(catalogo.especies, criterios.value, especiesDaZona.value))

const activos = computed(() => {
  const c = criterios.value
  return [c.mes !== null, !!c.habitat, !!c.tamano, !!c.grupo, !!c.zona]
    .filter(Boolean).length
})

function limpar() {
  criterios.value = criteriosBaleiros()
}

/** Un criterio que xa está posto quítase premendo outra vez. */
function alterna(clave: 'habitat' | 'tamano' | 'grupo', valor: string) {
  const c = criterios.value
  c[clave] = (c[clave] === valor ? null : valor) as never
}
</script>

<template>
  <div>
    <h1 class="titulo">Que paxaro é?</h1>
    <p class="intro">
      Non fai falta saber o nome. Responde ao que lembres — todo é opcional — e
      a lista vaise reducindo. As máis probables van primeiro.
    </p>

    <!-- Se o paxaro está cantando, o son resolve isto nun intre; e quen chega
         aquí adoita telo diante aínda. -->
    <p class="alternativa">
      Estao a escoitar cantar?
      <NuxtLink to="/escoitar">Identifícao polo son</NuxtLink>.
    </p>

    <section class="paso">
      <h2>Cando o viches</h2>
      <div class="opcions">
        <button
          class="opcion" :class="{ 'opcion--posta': criterios.mes === null }"
          @click="criterios.mes = null"
        >
          Calquera época
        </button>
        <button
          v-for="(nome, i) in MESES_GL" :key="nome"
          class="opcion" :class="{ 'opcion--posta': criterios.mes === i }"
          @click="criterios.mes = i"
        >
          {{ nome }}
        </button>
      </div>
    </section>

    <section class="paso">
      <h2>Onde estabas</h2>
      <div class="opcions">
        <button
          v-for="[h, n] in habitats" :key="h"
          class="opcion" :class="{ 'opcion--posta': criterios.habitat === h }"
          @click="alterna('habitat', h)"
        >
          {{ h }} <span class="opcion__conta">{{ n }}</span>
        </button>
      </div>
    </section>

    <section class="paso">
      <h2>A que se parecía</h2>
      <div class="opcions opcions--tamano">
        <button
          v-for="g in GRUPOS" :key="g.clave"
          class="opcion opcion--ancha"
          :class="{ 'opcion--posta': criterios.grupo === g.clave }"
          @click="alterna('grupo', g.clave)"
        >
          <span class="opcion__nome">{{ g.texto }}</span>
          <span class="opcion__exemplo">{{ g.exemplo }}</span>
        </button>
      </div>
    </section>

    <section class="paso">
      <h2>Que tamaño tiña</h2>
      <div class="opcions opcions--tamano">
        <button
          v-for="t in TAMANOS" :key="t.valor"
          class="opcion opcion--ancha"
          :class="{ 'opcion--posta': criterios.tamano === t.valor }"
          @click="alterna('tamano', t.valor)"
        >
          <span class="opcion__nome">{{ t.texto }}</span>
          <span class="opcion__exemplo">{{ t.exemplo }}</span>
          <span class="opcion__peso">{{ t.peso }}</span>
        </button>
      </div>
    </section>

    <section class="paso">
      <h2>En que comarca</h2>
      <div class="opcions">
        <button class="opcion" :disabled="estadoUbi === 'buscando'" @click="localiza()">
          {{ estadoUbi === 'buscando' ? 'Localizando…' : 'Onde estou' }}
        </button>
        <select v-model="criterios.zona" class="control" aria-label="Escoller comarca">
          <option :value="null">Toda Galicia</option>
          <option v-for="z in zonas.zonas" :key="z.id" :value="z.id">
            {{ z.nome }}
          </option>
        </select>
      </div>
      <p v-if="erroUbi" class="erro">{{ erroUbi }}</p>
    </section>

    <div class="resumo">
      <p class="conta">
        <strong>{{ resultados.length }}</strong>
        {{ resultados.length === 1 ? 'especie posible' : 'especies posibles' }}
        <span v-if="activos" class="conta__filtros">
          con {{ activos }} {{ activos === 1 ? 'resposta' : 'respostas' }}
        </span>
      </p>
      <div class="resumo__accions">
        <label class="check">
          <input v-model="criterios.incluirRaras" type="checkbox">
          Incluír raras
        </label>
        <button v-if="activos" class="ligazon" @click="limpar">Empezar de novo</button>
      </div>
    </div>

    <ul class="listaxe">
      <li v-for="e in resultados.slice(0, 60)" :key="e.slug">
        <NuxtLink :to="`/especie/${e.slug}`" class="tarxeta">
          <img
            v-if="e.foto" :src="e.foto.mini"
            :alt="`${nomeMostrado(e)} (${e.cientifico})`"
            class="tarxeta__foto" width="250" height="180"
            loading="lazy" decoding="async"
          >
          <span v-else class="tarxeta__foto tarxeta__foto--baleira" aria-hidden="true">🪶</span>
          <span class="tarxeta__nome">{{ nomeMostrado(e) }}</span>
          <span class="tarxeta__sci">{{ e.cientifico }}</span>
          <span v-if="e.rasgos?.comparanza" class="tarxeta__rasgo">
            {{ e.rasgos.comparanza }}
          </span>
        </NuxtLink>
      </li>
    </ul>

    <p v-if="resultados.length > 60" class="mais">
      Amósanse as 60 máis citadas de {{ resultados.length }}. Responde algo máis
      para acurtar a lista.
    </p>

    <p v-if="!resultados.length" class="baleiro">
      Ningunha especie cadra con todo iso. Proba a quitar algunha resposta: se
      cadra o paxaro era algo maior ou menor do que parecía.
    </p>
  </div>
</template>

<style scoped>
.titulo {
  margin: 0 0 0.3rem;
  font-size: 1.5rem;
}

.intro {
  margin: 0 0 1.25rem;
  color: var(--tinta-suave);
}

.alternativa {
  margin: -0.6rem 0 1.25rem;
  font-size: 0.9rem;
  color: var(--tinta-suave);
}

.paso {
  margin-bottom: 1.1rem;
}

.paso h2 {
  margin: 0 0 0.45rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tinta-suave);
}

.opcions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.opcions--tamano {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
}

.opcion {
  min-height: 2.75rem;
  padding: 0.4rem 0.75rem;
  font: inherit;
  font-size: 0.9rem;
  color: inherit;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: 999px;
  cursor: pointer;
}

.opcion:disabled {
  opacity: 0.6;
  cursor: default;
}

.opcion--posta {
  background: var(--fento);
  border-color: var(--fento);
  color: #fff;
}

.opcion--ancha {
  border-radius: var(--raio);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  text-align: left;
}

.opcion__nome {
  font-weight: 600;
}

.opcion__exemplo,
.opcion__conta {
  font-size: 0.75rem;
  opacity: 0.75;
}

/* O peso é referencia, non criterio: ninguén estima gramos mirando un paxaro.
   Vai debaixo do exemplo e máis apagado. */
.opcion__peso {
  font-size: 0.7rem;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.erro {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.resumo {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  margin: 1.25rem 0 0.75rem;
  background: var(--bretema);
  border-bottom: 1px solid var(--borde);
}

.conta {
  margin: 0;
  font-size: 1.05rem;
}

.conta__filtros {
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.resumo__accions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.ligazon {
  font: inherit;
  font-size: 0.85rem;
  color: var(--fento);
  background: none;
  border: none;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}

.listaxe {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
  /* Antes 9 rem: quedaban demasiado pequenas para recoñecer un paxaro, que é
     exactamente o que se vén facer aquí. */
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
}

/* De base.css só veñen o hover, o foco e as transicións: o maquetado das
   tarxetas segue sendo de cada páxina. */
.tarxeta {
  display: block;
  padding: 0 0 0.6rem;
  background: var(--papel);
  border: 1px solid var(--borde);
  border-radius: var(--raio);
  box-shadow: var(--sombra);
  text-decoration: none;
  color: inherit;
  height: 100%;
  overflow: hidden;
}

/* Proporción fixa e recorte: sen isto cada foto trae o seu alto e a grella
   queda a escaleira. */
.tarxeta__foto {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--bretema);
  margin-bottom: 0.5rem;
}

.tarxeta__foto--baleira {
  display: grid;
  place-items: center;
  font-size: 2rem;
  opacity: 0.35;
}

.tarxeta__nome,
.tarxeta__sci,
.tarxeta__rasgo {
  display: block;
  padding-inline: 0.65rem;
}

.tarxeta__nome {
  font-weight: 650;
  font-size: 0.95rem;
  line-height: 1.3;
}

.tarxeta__sci {
  font-style: italic;
  font-size: 0.78rem;
  color: var(--tinta-suave);
  line-height: 1.35;
}

.tarxeta__rasgo {
  font-size: 0.72rem;
  color: var(--granito);
  margin-top: 0.2rem;
}

.mais {
  margin-top: 1rem;
  color: var(--tinta-suave);
  font-size: 0.9rem;
}
</style>
