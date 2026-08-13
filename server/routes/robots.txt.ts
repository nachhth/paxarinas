/**
 * Vai como ruta e non como ficheiro estático para que a ligazón ao mapa do
 * sitio leve o dominio de `NUXT_PUBLIC_SITIO` e non un escrito a man que
 * quedaría desactualizado o día que se cambie de dominio.
 */
export default defineEventHandler((event) => {
  const base = (useRuntimeConfig().public.sitio as string).replace(/\/$/, '')
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# O modelo de son son 49 MB e a galería son metadatos que apuntan a',
    '# Commons: nin unha cousa nin a outra teñen sentido nun índice.',
    'Disallow: /birdnet/',
    'Disallow: /data/galeria/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
})
