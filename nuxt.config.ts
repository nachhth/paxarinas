// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-12',
  devtools: { enabled: true },

  modules: ['@vite-pwa/nuxt'],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Paxariñas — As aves de Galicia',
      short_name: 'Paxariñas',
      description: 'Guía das aves de Galicia en galego.',
      lang: 'gl',
      theme_color: '#2d5016',
      background_color: '#f4f5f2',
      display: 'standalone',
      start_url: '/',
    },
    workbox: {
      // O esqueleto e o catálogo van enteiros ao dispositivo: a app úsase no
      // monte, onde non hai cobertura. Das fotos só se precachean as
      // miniaturas (~7 MB); as de 500 px sumarían 23 MB máis e farían a
      // instalación inviable con datos móbiles.
      globPatterns: [
        '**/*.{js,css,html,json,svg,woff2}',
        'media/fotos/*-250.{jpg,jpeg,png}',
      ],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      runtimeCaching: [
        {
          // As fotos grandes cachéanse segundo se visitan as fichas.
          urlPattern: /\/media\/fotos\/.*-500\.(jpg|jpeg|png)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'paxarinas-fotos-grandes',
            expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },

  // Sitio estático: o catálogo é un ficheiro, non hai backend que consultar.
  ssr: true,

  experimental: {
    // O catálogo xa vai no bundle; os payloads por páxina só o duplicarían.
    payloadExtraction: false,
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },

  hooks: {
    // O crawler só ve as especies enlazadas desde a portada, e as raras están
    // agochadas tras un filtro. Engádense todas explicitamente.
    async 'prerender:routes'({ routes }) {
      const { readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const cru = await readFile(join(process.cwd(), 'data', 'especies.json'), 'utf-8')
      const catalogo = JSON.parse(cru)
      for (const e of catalogo.especies) routes.add(`/especie/${e.slug}`)
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'gl' },
      title: 'Paxariñas — As aves de Galicia',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Guía das aves de Galicia en galego: nomes tradicionais, fichas, distribución e cantos.',
        },
        { name: 'theme-color', content: '#2d5016' },
      ],
    },
  },

  css: ['~/assets/css/base.css'],
})
