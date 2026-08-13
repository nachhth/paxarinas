/**
 * Precarga do modelo de BirdNET en segundo plano, para que `/escoitar` estea
 * listo sen agardar 49 MB no momento no que alguén ten un paxaro cantando.
 *
 * Baixa soa, pero **non sempre**: 49 MB con datos móbiles poden custar cartos a
 * alguén que só quería mirar nomes. Por iso se comproba a conexión antes, e hai
 * un interruptor para apagalo. Se non se dan as condicións non pasa nada: o
 * botón de `/escoitar` segue aí e baixa cando llo pidan.
 *
 * Como no resto da app, non se escribe na Cache API: pídense os ficheiros con
 * `fetch` e gárdaos o service worker coa regra `CacheFirst` de `/birdnet/`.
 */

const CHAVE = 'paxarinas:precarga-son'

export type PreferenciaPrecarga = 'auto' | 'nunca'

export function preferenciaPrecarga(): PreferenciaPrecarga {
  if (!import.meta.client) return 'auto'
  return localStorage.getItem(CHAVE) === 'nunca' ? 'nunca' : 'auto'
}

export function gardaPreferenciaPrecarga(v: PreferenciaPrecarga) {
  if (!import.meta.client) return
  try {
    v === 'nunca' ? localStorage.setItem(CHAVE, 'nunca') : localStorage.removeItem(CHAVE)
  } catch { /* almacenamento bloqueado: non é motivo para romper nada */ }
}

/**
 * Se a conexión parece cara ou lenta, non se baixa nada.
 *
 * A API de rede non distingue wifi de datos en case ningún navegador, así que
 * se usa o que si dá: `saveData`, que é unha petición explícita de aforro, e a
 * calidade efectiva da conexión. Cando non hai información ningunha, dáse por
 * boa: bloquear por defecto deixaría a función sen usar na maioría dos casos.
 */
export function conexionAxeitada(): boolean {
  const c = (navigator as any).connection
  if (!c) return true
  if (c.saveData) return false
  if (['slow-2g', '2g', '3g'].includes(c.effectiveType)) return false
  // downlink vén en Mbps; por debaixo de 2 son máis de tres minutos de espera.
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 2) return false
  return true
}

/** Xa está no dispositivo? Evita pedir 49 MB que xa temos. */
async function xaCacheado(): Promise<boolean> {
  if (!('caches' in window)) return false
  try {
    const c = await caches.open('paxarinas-birdnet')
    return !!(await c.match('/birdnet/modelo/model.json'))
  } catch {
    return false
  }
}

/** Todos os ficheiros do modelo, sacados do propio manifesto de pesos. */
async function ficheirosDoModelo(): Promise<string[]> {
  const r = await fetch('/birdnet/modelo/model.json')
  if (!r.ok) throw new Error(`model.json: HTTP ${r.status}`)
  const manifesto = await r.json()

  const shards: string[] = []
  for (const grupo of manifesto.weightsManifest ?? []) {
    for (const ruta of grupo.paths ?? []) shards.push(`/birdnet/modelo/${ruta}`)
  }

  return [
    '/birdnet/melspec.json',
    '/birdnet/melspec.js',
    '/birdnet/galegas.json',
    '/birdnet/vendor/tf.min.js',
    ...shards,
  ]
}

export async function precargaSon(): Promise<'feito' | 'omitido' | 'erro'> {
  if (!import.meta.client) return 'omitido'
  if (preferenciaPrecarga() === 'nunca') return 'omitido'
  if (!navigator.onLine) return 'omitido'
  if (!navigator.serviceWorker?.controller) return 'omitido'
  if (!conexionAxeitada()) return 'omitido'
  if (await xaCacheado()) return 'feito'

  // Sen almacenamento persistente o navegador pode desaloxar os 49 MB á
  // primeira estreitez, e volveriamos baixalos.
  try { await navigator.storage?.persist?.() } catch { /* opcional */ }

  try {
    const ficheiros = await ficheirosDoModelo()
    // De un en un e non en paralelo: isto corre mentres alguén está a usar a
    // app, e non pode competir polo ancho de banda coas fotos que está a mirar.
    for (const url of ficheiros) {
      if (!navigator.onLine) return 'omitido'
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
      await r.arrayBuffer()
    }
    return 'feito'
  } catch {
    // Sen ruído: é unha comodidade, non unha función. Se falla, o botón de
    // /escoitar segue funcionando.
    return 'erro'
  }
}
