/**
 * As aves que xa viches, gardadas no propio dispositivo.
 *
 * Vai en `localStorage` e non nun servidor: non hai contas, non hai que
 * rexistrarse e non sae de aquí. A contrapartida é que non se sincroniza entre
 * dispositivos e que se perde ao borrar os datos do navegador — por iso hai
 * exportación a CSV, que é o que permite levalo a outro sitio.
 *
 * Gárdase o slug e a data. O slug non cambia mentres non cambie o nome
 * científico, e se algún día cambia, a especie desaparece da listaxe pero non
 * rompe nada: ao resolver contra o catálogo simplemente non aparece.
 */

const CHAVE = 'paxarinas:vistas'

export interface Vista {
  slug: string
  /** ISO curto, `AAAA-MM-DD`: a hora non lle importa a ninguén aquí. */
  data: string
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
      vistas.value = datos.filter(v => v && typeof v.slug === 'string')
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

  function marca(slug: string) {
    if (viches(slug)) return
    vistas.value = [...vistas.value, { slug, data: hoxe() }]
    garda()
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

  return { vistas, viches, marca, desmarca, alterna, baleira, dataDe }
}

/** CSV para poder levar a listaxe a outro sitio: é o seguro contra perdela. */
export function csvDeVistas(
  vistas: Vista[],
  nomeDe: (slug: string) => { gl: string; cientifico: string } | null,
) {
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  const liñas = ['data,nome galego,nome cientifico']

  for (const v of [...vistas].sort((a, b) => a.data.localeCompare(b.data))) {
    const n = nomeDe(v.slug)
    if (!n) continue
    liñas.push([v.data, escapa(n.gl), escapa(n.cientifico)].join(','))
  }

  return liñas.join('\n')
}
