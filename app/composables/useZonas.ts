import bruto from '~~/data/zonas.json'
import type { Punto, Zona, Zonas } from '~/types/catalogo'

const datos = bruto as unknown as Zonas

/**
 * As comarcas e as súas aves. Impórtase igual que o catálogo, en tempo de
 * compilación, para que o mapa funcione sen conexión: buscar as aves da zona
 * na que estás é precisamente o que se fai no monte, sen cobertura.
 *
 * Vai nun ficheiro aparte do catálogo porque só o precisa a páxina do mapa e
 * Nuxt parte o bundle por rota.
 */
export function useZonas() {
  return datos
}

/**
 * Galicia vai dos 41,8° aos 43,8° de latitude. A esa altura un grao de
 * lonxitude mide uns 0,73 graos de latitude, así que abonda con encoller o eixe
 * horizontal por ese factor para que o mapa non saia estirado. Unha proxección
 * de verdade non paga a pena nunha extensión tan pequena.
 */
const ESCALA_LONXITUDE = Math.cos((42.8 * Math.PI) / 180)

/** Coordenadas xeográficas a coordenadas de debuxo (y cara abaixo, como en SVG). */
export function proxecta([lon, lat]: Punto): Punto {
  return [lon * ESCALA_LONXITUDE, -lat]
}

const LARGO = 1000
const MARXE = 8

/**
 * O encadre é o mesmo para todos os mapas da app, e calcúlase unha soa vez: as
 * comarcas non cambian entre páxinas e dous mapas do mesmo sitio teñen que
 * saír coas mesmas proporcións para poderse comparar dun vistazo.
 */
const encadre = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const zona of datos.zonas) {
    for (const anel of zona.aneis) {
      for (const punto of anel) {
        const [x, y] = proxecta(punto)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const escala = (LARGO - 2 * MARXE) / (maxX - minX)
  return { minX, minY, escala, alto: (maxY - minY) * escala + 2 * MARXE }
})()

export const lenzo = {
  largo: LARGO,
  alto: encadre.alto,
  escala: encadre.escala,
  viewBox: `0 0 ${LARGO} ${encadre.alto}`,
}

/** Un punto xeográfico ás coordenadas do SVG. */
export function aLenzo(punto: Punto): Punto {
  const [x, y] = proxecta(punto)
  return [
    (x - encadre.minX) * encadre.escala + MARXE,
    (y - encadre.minY) * encadre.escala + MARXE,
  ]
}

const trazos = new Map<string, string>()

/** O atributo `d` dunha comarca: un subtrazo pechado por anel. */
export function trazo(zona: Zona): string {
  const feito = trazos.get(zona.id)
  if (feito) return feito

  const d = zona.aneis
    .map((anel) => {
      const puntos = anel.map((p) => {
        const [x, y] = aLenzo(p)
        return `${x.toFixed(1)} ${y.toFixed(1)}`
      })
      return `M${puntos.join('L')}Z`
    })
    .join('')

  trazos.set(zona.id, d)
  return d
}

/**
 * Se un punto cae dentro dun anel, por lanzamento de raio: cóntanse os lados
 * que cruza unha semirrecta horizontal e, se son impares, o punto está dentro.
 */
function dentroDoAnel(anel: Punto[], x: number, y: number): boolean {
  let dentro = false
  // O anel está pechado (o último punto repite o primeiro), así que só se
  // percorren os vértices únicos.
  const n = anel.length - 1
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = anel[i]!
    const [xj, yj] = anel[j]!
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

export function dentroDaZona(zona: Zona, lon: number, lat: number): boolean {
  return zona.aneis.some(anel => dentroDoAnel(anel, lon, lat))
}

/** A comarca na que cae unhas coordenadas, ou null se están fóra de Galicia. */
export function zonaDe(lon: number, lat: number): Zona | null {
  return datos.zonas.find(z => dentroDaZona(z, lon, lat)) ?? null
}

/**
 * A comarca máis próxima ao punto dado, medindo ao seu centro.
 *
 * Serve para quen está xusto na raia, no mar ou fóra de Galicia: é mellor
 * ofrecerlle a zona de ao lado, dicindo que é aproximada, que non dicirlle
 * nada. Compárase o cadrado da distancia para aforrar a raíz.
 */
/**
 * Cinco tons de máis claro a máis escuro. Van por opacidade sobre a mesma cor
 * do tema e non por unha paleta propia, así o mapa segue funcionando en modo
 * escuro sen manter dous xogos de cores.
 */
export const OPACIDADES = [0.14, 0.3, 0.47, 0.66, 0.88]

/**
 * Cortes sacados dos propios valores e non de números redondos: as citas de
 * aves están moi sesgadas —unhas poucas comarcas acaparan a maioría— e cuns
 * cortes fixos sairía case todo do mesmo ton.
 */
export function cortesPorCuantil(valores: number[], niveis = OPACIDADES.length): number[] {
  const ordenados = [...valores].sort((a, b) => a - b)
  if (!ordenados.length) return []
  return Array.from({ length: niveis - 1 }, (_, i) =>
    ordenados[Math.floor(((i + 1) / niveis) * (ordenados.length - 1))]!)
}

export function nivelDe(valor: number, cortes: number[]): number {
  return cortes.filter(corte => valor > corte).length
}

export interface PresenzaEnZona {
  zona: Zona
  citas: number
}

let porEspecie: Map<number, PresenzaEnZona[]> | null = null

/**
 * En que comarcas está citada unha especie, da máis citada á menos.
 *
 * O ficheiro está indexado ao revés (cada zona coas súas especies), que é como
 * o precisa o mapa xeral. Dálle a volta unha soa vez, a primeira que alguén
 * pregunta, e non 53 buscas por cada ficha que se abra.
 */
export function zonasDeEspecie(indice: number): PresenzaEnZona[] {
  if (!porEspecie) {
    porEspecie = new Map()
    for (const zona of datos.zonas) {
      zona.especies.forEach((especie, i) => {
        const lista = porEspecie!.get(especie)
        const entrada = { zona, citas: zona.citasEspecie[i]! }
        if (lista) lista.push(entrada)
        else porEspecie!.set(especie, [entrada])
      })
    }
    for (const lista of porEspecie.values()) {
      lista.sort((a, b) => b.citas - a.citas)
    }
  }
  return porEspecie.get(indice) ?? []
}

export function zonaMaisPreto(lon: number, lat: number): Zona {
  const [x, y] = proxecta([lon, lat])
  let mellor = datos.zonas[0]!
  let menor = Infinity

  for (const zona of datos.zonas) {
    const [cx, cy] = proxecta(zona.centro)
    const dist = (cx - x) ** 2 + (cy - y) ** 2
    if (dist < menor) {
      menor = dist
      mellor = zona
    }
  }
  return mellor
}
