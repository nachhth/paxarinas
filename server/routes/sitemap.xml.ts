import catalogo from '~~/data/especies.json'

/**
 * Mapa do sitio, xerado no momento de compilar.
 *
 * Son máis de 520 rutas estáticas con contido único en galego —fichas de aves
 * con nomes tradicionais que non están noutro sitio—, e sen isto un buscador
 * só chegaría ás enlazadas desde a portada. As especies raras van tras un
 * filtro, así que quedarían invisibles, que é o mesmo problema que xa obrigou
 * a listalas á man para prerenderizalas.
 *
 * A data de modificación é a da última execución do ETL: é a única data real
 * que temos, e mentir aquí só serviría para que os buscadores deixasen de
 * facernos caso.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base = (config.public.sitio as string).replace(/\/$/, '')
  const data = (catalogo as { rexistro?: { data?: string } }).rexistro?.data

  const paxinas = [
    { ruta: '/', prioridade: '1.0' },
    { ruta: '/identificar', prioridade: '0.9' },
    { ruta: '/escoitar', prioridade: '0.9' },
    { ruta: '/mapa', prioridade: '0.8' },
    { ruta: '/vistas', prioridade: '0.3' },
    { ruta: '/sen-conexion', prioridade: '0.3' },
    { ruta: '/creditos', prioridade: '0.3' },
    ...(catalogo as { especies: { slug: string }[] }).especies.map(e => ({
      ruta: `/especie/${e.slug}`,
      prioridade: '0.7',
    })),
  ]

  const urls = paxinas.map(p => [
    '  <url>',
    `    <loc>${base}${p.ruta}</loc>`,
    data ? `    <lastmod>${data}</lastmod>` : '',
    `    <priority>${p.prioridade}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
})
