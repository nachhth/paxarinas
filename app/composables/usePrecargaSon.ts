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
 * Por que non se baixa soa a conexión, ou `null` se se pode baixar.
 *
 * Úsase o que dá a API de rede: `saveData`, que é unha petición explícita de
 * aforro; o tipo de conexión cando o navegador o di; e a calidade efectiva.
 */
export type MotivoOmision = 'aforro' | 'datos' | 'lenta' | 'descoñecida'

export function motivoOmision(): MotivoOmision | null {
  const c = (navigator as any).connection
  // Firefox e Safari non implementan esta API: alí non hai como distinguir wifi
  // de 4G. Antes iso contaba como «conexión boa» e a app baixaba 51 MB por
  // sorpresa con datos móbiles, que é exactamente o que promete non facer en
  // /sen-conexion. Non sabelo ten que valer o mesmo que un non: o modelo segue a
  // un botón de distancia, e un botón non gasta os datos de ninguén.
  if (!c || typeof c.effectiveType !== 'string') return 'descoñecida'
  if (c.saveData) return 'aforro'
  // `type` só o dan algúns navegadores; cando o dá, é o dato bo.
  if (c.type === 'cellular') return 'datos'
  if (['slow-2g', '2g', '3g'].includes(c.effectiveType)) return 'lenta'
  // downlink vén en Mbps; por debaixo de 2 son máis de tres minutos de espera.
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 2) return 'lenta'
  return null
}

export function conexionAxeitada(): boolean {
  return motivoOmision() === null
}

/**
 * Está este ficheiro gardado no dispositivo?
 *
 * Pregúntaselle a `caches.match`, que busca en TODAS as cachés da orixe, e non
 * a unha caché aberta polo seu nome. Non é un detalle: `/birdnet/` está repartido
 * en dúas —o modelo por un lado e o código por outro, porque teñen que
 * caducar de maneira distinta— e a versión anterior disto abría só a do modelo.
 * Como alí buscaba tamén o worker e o TF.js, que xa non están nesa caché, daba
 * «non está» sempre e a app pedía baixar os 49 MB en cada recarga, coa descarga
 * feita.
 *
 * Preguntar por URL e non por nome de caché fai que isto siga valendo se mañá se
 * volven repartir doutro xeito.
 */
async function gardado(url: string): Promise<boolean> {
  return !!await caches.match(url)
}

/** O que non depende do manifesto de pesos e fai falta sempre. */
const IMPRESCINDIBLES = [
  '/birdnet/melspec.json',
  '/birdnet/melspec.js',
  '/birdnet/galegas.json',
  '/birdnet/worker.js',
  '/birdnet/vendor/tf.min.js',
]

/**
 * O backend de WebGPU. Báixase, pero non se esixe para dar o modelo por
 * completo: só o carga o worker en navegadores con `navigator.gpu`, así que
 * esixilo diría «fáltache algo» para sempre en todos os demais.
 */
const OPCIONAIS = ['/birdnet/vendor/tf-backend-webgpu.min.js']

/**
 * Xa está o modelo **enteiro** no dispositivo?
 *
 * Non chega con mirar `model.json`: é o primeiro ficheiro que pide TF.js, así
 * que unha descarga cortada á metade deixa o manifesto na caché e ningún shard.
 * Se nos fiásemos del, `/escoitar` diría «xa o tes» e despois baixaría 49 MB en
 * silencio, que é xusto o que non pode pasar con datos móbiles. Compróbanse
 * todos os shards, e sen tocar a rede: o manifesto lese da propia caché.
 */
export async function modeloNoDispositivo(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false
  try {
    const manifesto = await caches.match('/birdnet/modelo/model.json')
    if (!manifesto) return false
    for (const url of IMPRESCINDIBLES) {
      if (!await gardado(url)) return false
    }
    const json = await manifesto.json()
    for (const grupo of json.weightsManifest ?? []) {
      for (const ruta of grupo.paths ?? []) {
        if (!await gardado(`/birdnet/modelo/${ruta}`)) return false
      }
    }
    return true
  } catch {
    return false
  }
}

/** Todos os ficheiros do modelo, sacados do propio manifesto de pesos. */
export async function ficheirosDoModelo(): Promise<string[]> {
  const r = await fetch('/birdnet/modelo/model.json')
  if (!r.ok) throw new Error(`model.json: HTTP ${r.status}`)
  const manifesto = await r.json()

  const shards: string[] = []
  for (const grupo of manifesto.weightsManifest ?? []) {
    for (const ruta of grupo.paths ?? []) shards.push(`/birdnet/modelo/${ruta}`)
  }

  return [...IMPRESCINDIBLES, ...OPCIONAIS, ...shards]
}

/**
 * Baixa o modelo enteiro deixando que o garde o service worker, avisando do
 * avance. Úsana a precarga automática e o botón de `/sen-conexion`.
 *
 * De un en un e non en paralelo: isto corre mentres alguén está a usar a app, e
 * non pode competir polo ancho de banda coas fotos que está a mirar.
 */
export async function baixaModelo(
  avance?: (feitos: number, total: number, bytes: number) => void,
  segue: () => boolean = () => true,
): Promise<void> {
  const ficheiros = await ficheirosDoModelo()
  let bytes = 0
  avance?.(0, ficheiros.length, 0)
  for (const [i, url] of ficheiros.entries()) {
    if (!navigator.onLine || !segue()) throw new Error('descarga interrompida')
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
    // Hai que consumir o corpo: se non, a resposta non chega a rematar e o
    // service worker non a garda.
    bytes += (await r.arrayBuffer()).byteLength
    avance?.(i + 1, ficheiros.length, bytes)
  }
}

export async function precargaSon(): Promise<'feito' | 'omitido' | 'erro'> {
  if (!import.meta.client) return 'omitido'
  if (preferenciaPrecarga() === 'nunca') return 'omitido'
  if (!navigator.onLine) return 'omitido'
  if (!navigator.serviceWorker?.controller) return 'omitido'
  if (!conexionAxeitada()) return 'omitido'
  if (await modeloNoDispositivo()) return 'feito'

  // Sen almacenamento persistente o navegador pode desaloxar os 49 MB á
  // primeira estreitez, e volveriamos baixalos.
  try { await navigator.storage?.persist?.() } catch { /* opcional */ }

  try {
    await baixaModelo()
    return 'feito'
  } catch {
    // Sen ruído: é unha comodidade, non unha función. Se falla, o botón de
    // /escoitar segue funcionando.
    return 'erro'
  }
}
