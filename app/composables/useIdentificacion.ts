import { veseNoMes } from '~/composables/useCatalogo'
import type { Especie, Tamano } from '~/types/catalogo'

/**
 * Filtrado por rasgos para chegar a unha especie sen saber o seu nome.
 *
 * Dúas decisións que mandan sobre todo o demais:
 *
 * 1. **Ningún filtro é obrigatorio.** Un asistente de pasos fixos acaba en
 *    cero resultados e sen saber que responder mal. Aquí cada resposta recorta
 *    e vese ao momento canto recorta.
 *
 * 2. **Ordénase por número de citas, non alfabeticamente.** Quen ve un paxaro
 *    no monte case sempre está a ver un dos comúns. Poñer o merlo antes que
 *    unha divagante con tres citas non é un capricho: é a resposta probable.
 */

/**
 * As clases de tamaño saen do peso de AVONET, cos cortes en 12, 30, 100, 350 e
 * 1200 g. O peso amósase como referencia, pero o exemplo vai primeiro a
 * propósito: ninguén mira un paxaro e estima gramos, mentres que «coma un
 * pardal» si que se entende.
 */
export const TAMANOS: {
  valor: Tamano; texto: string; exemplo: string; peso: string
}[] = [
  { valor: 'moi pequena', texto: 'Moi pequena', exemplo: 'ferreiriño, carriza', peso: 'menos de 12 g' },
  { valor: 'pequena', texto: 'Pequena', exemplo: 'pardal, pimpín', peso: '12 a 30 g' },
  { valor: 'mediana', texto: 'Mediana', exemplo: 'merlo, estorniño', peso: '30 a 100 g' },
  { valor: 'grande', texto: 'Grande', exemplo: 'pomba, pega', peso: '100 a 350 g' },
  { valor: 'moi grande', texto: 'Moi grande', exemplo: 'corvo, gaivota', peso: '350 g a 1,2 kg' },
  { valor: 'enorme', texto: 'Enorme', exemplo: 'ganso, aguia, garza', peso: 'máis de 1,2 kg' },
]

/**
 * Grupos polos que alguén recoñece un paxaro sen sabelo nomear: a silueta.
 *
 * Non se lle pode preguntar a ninguén se o que viu era un Charadriiforme. Isto
 * traduce a taxonomía de GBIF a categorías que se ven de lonxe. Vai por familia
 * cando a orde mestura cousas moi distintas — os Charadriiformes inclúen desde
 * unha píllara ata un arao— e por orde no resto.
 */
export interface Grupo {
  clave: string
  texto: string
  exemplo: string
  ordes?: string[]
  familias?: string[]
}

export const GRUPOS: Grupo[] = [
  { clave: 'paseriformes', texto: 'Paxaros pequenos', exemplo: 'pardal, merlo, ferreiriño', ordes: ['Passeriformes'] },
  { clave: 'anatidas', texto: 'Patos e gansos', exemplo: 'lavanco, cerceta', ordes: ['Anseriformes'] },
  { clave: 'limicolas', texto: 'Limícolas', exemplo: 'píllara, mazarico, bilurico', familias: ['Scolopacidae', 'Charadriidae', 'Recurvirostridae', 'Haematopodidae', 'Burhinidae', 'Glareolidae'] },
  { clave: 'gaivotas', texto: 'Gaivotas e carráns', exemplo: 'gaivota chorona', familias: ['Laridae'] },
  { clave: 'marinas', texto: 'Aves de mar aberto', exemplo: 'furabuchos, paíños, araos', ordes: ['Procellariiformes'], familias: ['Alcidae', 'Stercorariidae', 'Sulidae', 'Phalacrocoracidae'] },
  { clave: 'rapaces', texto: 'Rapaces diúrnas', exemplo: 'miñato, azor, falcón', ordes: ['Accipitriformes', 'Falconiformes'] },
  { clave: 'nocturnas', texto: 'Curuxas e mouchos', exemplo: 'curuxa, moucho', ordes: ['Strigiformes'] },
  { clave: 'pernaltas', texto: 'Garzas e cegoñas', exemplo: 'garza real, cegoña', ordes: ['Ciconiiformes', 'Phoenicopteriformes'], familias: ['Ardeidae', 'Threskiornithidae', 'Pelecanidae'] },
  { clave: 'mergullons', texto: 'Mergullóns e mobellas', exemplo: 'mergullón cristado', ordes: ['Podicipediformes', 'Gaviiformes'] },
  { clave: 'galinolas', texto: 'Galiñolas e rascóns', exemplo: 'galiñola de auga', ordes: ['Gruiformes'] },
  { clave: 'pombas', texto: 'Pombas e rulas', exemplo: 'pomba torcaz, rula', ordes: ['Columbiformes'] },
  { clave: 'petos', texto: 'Petos', exemplo: 'peto real, peto formigueiro', ordes: ['Piciformes'] },
  { clave: 'galinaceas', texto: 'Perdices e faisáns', exemplo: 'perdiz rubia', ordes: ['Galliformes'] },
]

export function grupoDe(e: Especie): string | null {
  for (const g of GRUPOS) {
    if (g.familias && e.familia && g.familias.includes(e.familia)) return g.clave
    if (g.ordes && e.orde && g.ordes.includes(e.orde)) return g.clave
  }
  return null
}

export const MESES_GL = [
  'xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro',
]

export interface Criterios {
  mes: number | null
  habitat: string | null
  tamano: Tamano | null
  grupo: string | null
  zona: string | null
  incluirRaras: boolean
}

export function criteriosBaleiros(): Criterios {
  return {
    mes: null, habitat: null, tamano: null, grupo: null,
    zona: null, incluirRaras: false,
  }
}

// Sen `ñ` no nome: o escaneo de importacións automáticas de Nuxt non recoñece
// os identificadores con caracteres non ASCII e non o importaría.
/** Os hábitats que existen de verdade no catálogo, co seu reconto. */
export function habitatsDoCatalogo(especies: Especie[]) {
  const conta = new Map<string, number>()
  for (const e of especies) {
    const h = e.rasgos?.habitat
    if (h) conta.set(h, (conta.get(h) ?? 0) + 1)
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])
}

export function filtra(
  especies: Especie[],
  c: Criterios,
  especiesDaZona: Set<number> | null,
): Especie[] {
  const resultado = especies.filter((e, i) => {
    if (e.rara && !c.incluirRaras) return false
    // Sen fenoloxía fiable non se descarta: sabemos pouco dela, non que non
    // estea. Ver `veseNoMes`.
    if (c.mes !== null && !veseNoMes(e, c.mes)) return false
    if (c.tamano && e.rasgos?.tamano !== c.tamano) return false
    if (c.habitat && e.rasgos?.habitat !== c.habitat) return false
    if (c.grupo && grupoDe(e) !== c.grupo) return false
    if (especiesDaZona && !especiesDaZona.has(i)) return false
    return true
  })

  // O paxaro que estás a ver é, case sempre, un dos comúns.
  return resultado.sort((a, b) => b.citas - a.citas)
}
