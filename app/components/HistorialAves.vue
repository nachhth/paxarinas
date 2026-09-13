<script setup lang="ts">
import type { Especie } from '~/types/catalogo'
import type { Orixe, Paso } from '~/composables/useHistorial'

/**
 * Por onde pasaches: fichas abertas e o que che dixo o identificador por son.
 *
 * Vai debaixo das aves marcadas e non mesturado con elas: as marcas son o que
 * decides ti, isto é rastro. Por iso tamén se pode baleirar sen máis aviso ca
 * unha confirmación.
 */
const catalogo = useCatalogo()
const { pasos, baleira } = useHistorial()
const { viches } = useVistas()

const porSlug = new Map(catalogo.especies.map(e => [e.slug, e]))

const filtro = ref<'todo' | Orixe>('todo')

interface Fila {
  especie: Especie
  /** Un por orixe: unha ave pode ser aberta e ademais darlle o son. */
  pasos: Paso[]
  /** O máis recente dos seus pasos, que é por onde se ordena. */
  cando: string
}

/**
 * Unha fila por especie, non por paso.
 *
 * Aínda que por dentro se garde un rexistro por orixe, un merlo que abriches e
 * que ademais che deu o son é un merlo: en dúas filas seguidas parece un
 * duplicado. Xúntanse e amósanse as dúas etiquetas.
 */
const todas = computed<Fila[]>(() => {
  const por = new Map<string, Paso[]>()
  for (const paso of pasos.value) {
    if (!porSlug.has(paso.slug)) continue
    const lista = por.get(paso.slug)
    if (lista) lista.push(paso)
    else por.set(paso.slug, [paso])
  }

  return [...por.entries()]
    .map(([slug, lista]) => ({
      especie: porSlug.get(slug)!,
      // O son primeiro: é o dato que trae algo novo, a confianza.
      pasos: [...lista].sort((a, b) => (a.orixe === 'son' ? -1 : 1) - (b.orixe === 'son' ? -1 : 1)),
      cando: lista.reduce((m, p) => (p.cando > m ? p.cando : m), ''),
    }))
    .sort((a, b) => b.cando.localeCompare(a.cando))
})

const contas = computed(() => ({
  ficha: todas.value.filter(f => f.pasos.some(p => p.orixe === 'ficha')).length,
  son: todas.value.filter(f => f.pasos.some(p => p.orixe === 'son')).length,
}))

/**
 * Ao filtrar por orixe, a fila queda só con esa: as etiquetas, a hora e a orde
 * teñen que ser as dese paso.
 *
 * `cando` recalcúlase e a lista reordénase. Se non, unha ave que abriches hai
 * corenta días pero que soou hai cinco minutos saía en «Abertas» como «hai 5
 * min» e a primeira de todas, que é a hora do son.
 */
const filas = computed<Fila[]>(() => {
  if (filtro.value === 'todo') return todas.value
  return todas.value
    .filter(f => f.pasos.some(p => p.orixe === filtro.value))
    .map((f) => {
      const seus = f.pasos.filter(p => p.orixe === filtro.value)
      return { ...f, pasos: seus, cando: seus[0]!.cando }
    })
    .sort((a, b) => b.cando.localeCompare(a.cando))
})

/**
 * «hai 2 días» e non a data: nun historial o que importa é canto hai, e para
 * hoxe ou onte a data é máis difícil de ler ca a palabra.
 */
const MINUTO = 60_000
const HORA = 60 * MINUTO
const DÍA = 24 * HORA

function candoFoi(iso: string) {
  const desde = Date.now() - new Date(iso).getTime()
  if (desde < 2 * MINUTO) return 'agora mesmo'
  if (desde < HORA) return `hai ${Math.round(desde / MINUTO)} min`
  if (desde < DÍA) {
    const h = Math.round(desde / HORA)
    return `hai ${h} ${h === 1 ? 'hora' : 'horas'}`
  }
  const d = Math.round(desde / DÍA)
  if (d === 1) return 'onte'
  if (d < 30) return `hai ${d} días`
  return new Date(iso).toISOString().slice(0, 10)
}

const confirmando = ref(false)
</script>

<template>
  <section v-if="todas.length" class="historial">
    <h2 class="historial__título">Historial</h2>
    <p class="historial__intro">
      As fichas que abriches e o que che deu o identificador por son. Non son
      marcas: só o rastro, para poder volver.
    </p>

    <!-- Os filtros só aparecen se hai as dúas cousas; cun só tipo serían dous
         botóns dos que un non fai nada. -->
    <div
      v-if="contas.ficha && contas.son" class="tipos"
      role="group" aria-label="Que amosar do historial"
    >
      <button
        class="tipo" :class="{ 'tipo--posto': filtro === 'todo' }"
        :aria-pressed="filtro === 'todo'" @click="filtro = 'todo'"
      >
        Todo <span class="tipo__conta">{{ todas.length }}</span>
      </button>
      <button
        class="tipo" :class="{ 'tipo--posto': filtro === 'ficha' }"
        :aria-pressed="filtro === 'ficha'" @click="filtro = 'ficha'"
      >
        Abertas <span class="tipo__conta">{{ contas.ficha }}</span>
      </button>
      <button
        class="tipo" :class="{ 'tipo--posto': filtro === 'son' }"
        :aria-pressed="filtro === 'son'" @click="filtro = 'son'"
      >
        Polo son <span class="tipo__conta">{{ contas.son }}</span>
      </button>
    </div>

    <ul class="pasos">
      <li v-for="{ pasos: seus, especie, cando } in filas" :key="especie.slug">
        <NuxtLink :to="`/especie/${especie.slug}`" class="paso">
          <img
            v-if="especie.foto" :src="especie.foto.mini"
            :alt="nomeMostrado(especie)" class="paso__foto"
            :style="{ objectPosition: encadre(especie.foto) }"
            width="44" height="44" loading="lazy" decoding="async"
          >
          <span v-else class="paso__foto paso__foto--baleira" aria-hidden="true"><IconaPluma /></span>

          <span class="paso__texto">
            <span class="paso__nome">
              {{ nomeMostrado(especie) }}
              <!-- Dise se xa a marcaches: se non, o historial convida a marcar
                   outra vez algo que xa está na listaxe de arriba. -->
              <span v-if="viches(especie.slug)" class="paso__vista" title="Xa a marcaches">✓</span>
            </span>
            <span class="paso__onde">
              <span
                v-for="paso in seus" :key="paso.orixe"
                class="paso__marca" :class="`paso__marca--${paso.orixe}`"
              >
                <template v-if="paso.orixe === 'son'">
                  polo son<template v-if="paso.confianza !== undefined">
                    · {{ Math.round(paso.confianza * 100) }}%
                  </template>
                </template>
                <template v-else>
                  aberta<template v-if="paso.veces > 1"> · {{ paso.veces }} veces</template>
                </template>
              </span>
            </span>
          </span>

          <span class="paso__cando">{{ candoFoi(cando) }}</span>
        </NuxtLink>
      </li>
    </ul>

    <p class="historial__pé">
      <button v-if="!confirmando" class="ligazon" @click="confirmando = true">
        Baleirar o historial
      </button>
      <span v-else class="confirmar">
        Bórrase o rastro; as aves marcadas non se tocan.
        <button class="ligazon" @click="baleira(); confirmando = false">Si, baleirar</button>
        <button class="ligazon" @click="confirmando = false">Cancelar</button>
      </span>
    </p>
  </section>
</template>

<style scoped>
.historial {
  margin-top: calc(var(--oco) * 1.5);
  padding-top: var(--oco);
  border-top: 1px solid var(--borde);
}

.historial__título {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
}

.historial__intro {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--tinta-suave);
  max-width: 40rem;
}

.tipos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.tipo {
  min-height: 34px;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: var(--papel);
  color: var(--tinta-suave);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--saída), border-color var(--saída);
}

.tipo:hover {
  border-color: var(--fento-claro);
  color: var(--fento);
}

.tipo:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.tipo--posto {
  background: var(--fento-tenue);
  border-color: color-mix(in srgb, var(--fento) 45%, transparent);
  color: var(--fento);
}

.tipo__conta {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.pasos {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}

/* Máis baixo ca as aves marcadas: é rastro, e non ten que competir coa listaxe
   de arriba nin en tamaño nin en peso visual. */
.paso {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--raio);
  color: inherit;
  text-decoration: none;
  transition: background var(--saída);
}

.paso:hover,
.paso:focus-visible {
  background: var(--bretema);
}

.paso:focus-visible {
  outline: 2px solid var(--foco);
  outline-offset: 2px;
}

.paso__foto {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: calc(var(--raio) - 3px);
  object-fit: cover;
  background: var(--bretema);
}

.paso__foto--baleira {
  display: grid;
  place-items: center;
  color: var(--fento-claro);
}

.paso__foto--baleira :deep(svg) {
  width: 20px;
  height: 20px;
}

.paso__texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.paso__nome {
  font-weight: 600;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.paso__vista {
  color: var(--fento);
  font-size: 0.85em;
}

.paso__onde {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--tinta-suave);
}

.paso__marca {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--bretema);
  border: 1px solid var(--borde);
  font-weight: 600;
}

/* O son leva a cor do identificador, que é a mesma das chinchetas do mapa: o
   que vén de escoitar recoñécese en toda a app pola mesma cor. */
.paso__marca--son {
  background: color-mix(in srgb, var(--papo) 16%, transparent);
  border-color: color-mix(in srgb, var(--papo) 40%, transparent);
  color: color-mix(in srgb, var(--papo) 70%, var(--tinta));
}

.paso__cando {
  flex: none;
  font-size: 0.75rem;
  color: var(--tinta-suave);
  text-align: right;
}

.historial__pé {
  margin: 0;
  font-size: 0.85rem;
}

.confirmar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  color: var(--tinta-suave);
}
</style>
