/**
 * As aves que xa viches, gardadas no propio dispositivo.
 *
 * Vai en `localStorage` e non nun servidor: non hai contas, non hai que
 * rexistrarse e non sae de aquí. A contrapartida é que non se sincroniza entre
 * dispositivos e que se perde ao borrar os datos do navegador — por iso hai
 * exportación a CSV, que é o que permite levalo a outro sitio.
 *
 * Gárdase o slug, a data e, se o dispositivo o soubo dicir, onde foi. O slug
 * non cambia mentres non cambie o nome científico, e se algún día cambia, a
 * especie desaparece da listaxe pero non rompe nada: ao resolver contra o
 * catálogo simplemente non aparece.
 *
 * As coordenadas son o dato máis delicado que garda a app —din onde estiveches
 * e cando—, así que van coas mesmas regras ca o resto: só neste dispositivo,
 * nunca a un servidor, e bórranse desde «As miñas aves» sen perder as marcas.
 */

const CHAVE = 'paxarinas:vistas'

export interface Lugar {
  lon: number
  lat: number
  /** Radio de incerteza en metros, tal e como o deu o dispositivo. */
  precision: number
}

export interface Vista {
  slug: string
  /** ISO curto, `AAAA-MM-DD`: a hora non lle importa a ninguén aquí. */
  data: string
  /**
   * Onde a viches, se o dispositivo o soubo dicir cando a marcaches.
   *
   * É opcional e vaino ser sempre: sen permiso de localización, baixo teito ou
   * marcando desde a casa unha ave que viches onte, non hai sitio que gardar.
   * Todo o que le isto ten que aguantar que falte.
   */
  lugar?: Lugar
}

/** Cinco decimais son pouco máis dun metro. Máis é gardar ruído do GPS. */
function redondea(n: number) {
  return Math.round(n * 1e5) / 1e5
}

/**
 * Se o que hai gardado é un sitio de verdade.
 *
 * Compróbase o rango e non só o tipo: un `lat: 200` non existe, e pintaríao o
 * mapa nalgún sitio absurdo en vez de ignoralo.
 */
function lugarVálido(l: unknown): l is Lugar {
  if (!l || typeof l !== 'object') return false
  const { lon, lat, precision } = l as Record<string, unknown>
  return typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180
    && typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof precision === 'number' && Number.isFinite(precision) && precision >= 0
}

const vistas = ref<Vista[]>([])
const cargado = ref(false)

function garda() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify(vistas.value))
  } catch {
    // Cota chea ou almacenamento bloqueado (modo privado nalgúns navegadores).
    // Non se avisa cun erro: perder unha marca non xustifica interromper nada.
  }
}

function carga() {
  if (cargado.value || !import.meta.client) return
  cargado.value = true
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return
    const datos = JSON.parse(cru)
    if (Array.isArray(datos)) {
      // Compróbase tamén a data e non só o slug: quen consome isto ordena por
      // `data.localeCompare(...)` —a listaxe e mais o CSV—, así que unha
      // entrada sen data non daba unha marca rara, tumbaba a páxina enteira
      // cun TypeError. O que hai aquí escríbeo a app, pero tamén o pode tocar
      // calquera desde a consola, e o formato pode cambiar algún día.
      vistas.value = datos
        .filter(v => v && typeof v.slug === 'string' && typeof v.data === 'string')
        // O sitio é opcional, así que unha entrada cun `lugar` estragado non se
        // tira: quítaselle o sitio e queda a marca, que é o que importa.
        .map((v: Vista) => (v.lugar && !lugarVálido(v.lugar)
          ? { slug: v.slug, data: v.data }
          : v))
    }
  } catch {
    // Se o que hai gardado non se pode ler, mellor empezar baleiro que romper.
  }
}

export function useVistas() {
  onMounted(carga)

  function hoxe() {
    return new Date().toISOString().slice(0, 10)
  }

  function viches(slug: string) {
    return vistas.value.some(v => v.slug === slug)
  }

  function marca(slug: string, lugar?: Lugar | null) {
    if (viches(slug)) return
    vistas.value = [...vistas.value, { slug, data: hoxe(), ...(lugar ? { lugar } : {}) }]
    garda()
  }

  /**
   * Apúntalle o sitio a unha marca que xa existe.
   *
   * Faise en dous tempos a propósito: localizar tarda segundos e a marca ten
   * que quedar feita no intre en que se preme. Se a posición chega despois,
   * engádese; se non chega, ou se entre medias se desmarcou a ave, non pasa
   * nada.
   */
  function poñLugar(slug: string, lugar: Lugar) {
    if (!lugarVálido(lugar)) return
    const limpo: Lugar = {
      lon: redondea(lugar.lon),
      lat: redondea(lugar.lat),
      precision: Math.round(lugar.precision),
    }
    let cambiou = false
    vistas.value = vistas.value.map((v) => {
      if (v.slug !== slug || v.lugar) return v
      cambiou = true
      return { ...v, lugar: limpo }
    })
    if (cambiou) garda()
  }

  /** Borra os sitios pero deixa as marcas. */
  function esqueceLugares() {
    vistas.value = vistas.value.map(({ slug, data }) => ({ slug, data }))
    garda()
  }

  function lugarDe(slug: string) {
    return vistas.value.find(v => v.slug === slug)?.lugar ?? null
  }

  function desmarca(slug: string) {
    vistas.value = vistas.value.filter(v => v.slug !== slug)
    garda()
  }

  function alterna(slug: string) {
    viches(slug) ? desmarca(slug) : marca(slug)
  }

  function baleira() {
    vistas.value = []
    garda()
  }

  function dataDe(slug: string) {
    return vistas.value.find(v => v.slug === slug)?.data ?? null
  }

  return {
    vistas, viches, marca, desmarca, alterna, baleira, dataDe,
    poñLugar, esqueceLugares, lugarDe,
  }
}

/** CSV para poder levar a listaxe a outro sitio: é o seguro contra perdela. */
export function csvDeVistas(
  vistas: Vista[],
  nomeDe: (slug: string) => { gl: string; cientifico: string } | null,
) {
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  // As coordenadas van en columnas propias e en punto decimal, que é o que
  // esperan QGIS, eBird ou unha folla de cálculo. Van baleiras cando non hai
  // sitio gardado, e non a cero: cero é un punto no golfo de Guinea.
  const liñas = ['data,nome galego,nome cientifico,latitude,lonxitude,precision_m']

  for (const v of [...vistas].sort((a, b) => a.data.localeCompare(b.data))) {
    const n = nomeDe(v.slug)
    if (!n) continue
    liñas.push([
      v.data, escapa(n.gl), escapa(n.cientifico),
      v.lugar ? v.lugar.lat : '',
      v.lugar ? v.lugar.lon : '',
      v.lugar ? Math.round(v.lugar.precision) : '',
    ].join(','))
  }

  return liñas.join('\n')
}
