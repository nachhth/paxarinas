const MESES = [
  'xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
  'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro',
]

/**
 * `AAAA-MM-DD` a «13 de agosto de 2026».
 *
 * Non se usa `toLocaleDateString`: daría o formato do sistema de quen mira, que
 * nun teléfono en castelán ou en inglés rompería o galego do resto da páxina.
 */
export function dataLonga(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [ano, mes, dia] = iso.split('-')
  const nomeMes = MESES[Number(mes) - 1]
  if (!ano || !nomeMes || !dia) return iso
  return `${Number(dia)} de ${nomeMes} de ${ano}`
}
