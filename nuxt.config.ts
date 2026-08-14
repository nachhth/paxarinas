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
      /* Pantalla de arranque. Antes era o branco do papel e o resultado era un
         cadrado verde no medio dun folio en branco. Co mesmo verde da icona, o
         fondo redondeado da icona fúndese co da pantalla e o que se ve é o
         paporrubio solo. Ademais é o que menos deslumbra: a app ábrese ao
         amencer e ao solpor. */
      background_color: '#2d5016',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        // A maskable deixa o paxaro dentro do 80% central: Android recorta.
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // O esqueleto e o catálogo van enteiros ao dispositivo: a app úsase no
      // monte, onde non hai cobertura. Das fotos só se precachean as
      // miniaturas (~7 MB); as de 500 px sumarían 23 MB máis e farían a
      // instalación inviable con datos móbiles.
      globPatterns: [
        '**/*.{js,css,html,json,svg,woff2}',
        '{icon-192,icon-512,icon-maskable-512,apple-touch-icon,favicon-32}.png',
        'media/fotos/*-250.{jpg,jpeg,png}',
      ],
      // A galería é deliberadamente só en liña: os seus metadatos apuntan a
      // imaxes aloxadas en Commons, así que precachealos sería gardar 517
      // ficheiros que sen cobertura non levan a ningunha parte.
      //
      // De `birdnet/` non pode entrar NADA. Son 51 MB (modelo, TensorFlow.js e
      // o worker) fronte aos ~16 MB que custa instalar a app enteira, e o
      // identificador por son é unha función opcional: quen só queira o
      // catálogo e os nomes galegos non debe descargar nin un byte. Ollo con
      // relaxar isto: `globPatterns` colle todo o `.js` e `.json`, así que
      // `model.json` (120 kB) e `tf.min.js` (1,4 MB) entrarían solos.
      globIgnores: ['**/data/galeria/**', '**/birdnet/**'],
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
        {
          // Os cantos son 17 MB: precacheados dobrarían a instalación, así que
          // van quedando no dispositivo a medida que se escoitan.
          urlPattern: /\/media\/cantos\/.*\.opus$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'paxarinas-cantos',
            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // BirdNET: 51 MB fóra do precache. Como coas fotos grandes e os
          // cantos, `/escoitar` pídeo con `fetch` e é este `CacheFirst` quen o
          // garda; a páxina non escribe na Cache API. Sen esta regra o modelo
          // habería que rebaixalo cada vez, que é xusto o que non pode pasar
          // cando a app se usa no monte.
          //
          // `maximumFileSizeToCacheInBytes` non se aplica aquí: é un límite do
          // precache, e os shards son de 4 MB.
          urlPattern: /\/birdnet\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'paxarinas-birdnet',
            expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
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

  features: {
    // Por defecto Nuxt incrusta o CSS de cada compoñente na páxina. Con 517
    // fichas que comparten os mesmos estilos iso multiplica por 517 cada regra:
    // engadir dous bloques á ficha subiu o precache de 17 a 22 MB. Nun sitio
    // que se precachea enteiro, unha folla compartida sempre é mellor.
    inlineStyles: false,
  },

  runtimeConfig: {
    public: {
      // Dominio absoluto, que o esixen os mapas de sitio. Cámbiase sen tocar
      // código coa variable de contorno NUXT_PUBLIC_SITIO; en Vercel, nas
      // variables do proxecto.
      sitio: 'https://paxarinas.vercel.app',
    },
  },

  nitro: {
    /**
     * Cabeceiras de seguridade. Van aquí e non nun `vercel.json` para que
     * `nuxt preview` se comporte coma o despregue: unha CSP que só existe en
     * produción é unha CSP que se descobre rota en produción.
     *
     * O que a CSP SI fai aquí: acotar a onde pode falar a app. `connect-src
     * 'self'` e `img-src` cos dous dominios de Wikimedia significan que ningún
     * script inxectado podería mandar a ningures nin as marcas de aves nin a
     * posición; `frame-ancestors 'none'` impide que a app se embeba nun iframe
     * alleo, que con permisos de micrófono e localización non é un detalle.
     *
     * O que NON fai: `script-src` leva `'unsafe-inline'` porque Nuxt inxecta a
     * configuración e o importmap en scripts en liña, e o hash cambia con cada
     * `buildId`. Con `'unsafe-inline'` un `javascript:` nun href seguiría
     * executando, así que a defensa contra iso é `ligazon()` no sitio onde se
     * pinta, non esta cabeceira. Se algún día se poden eliminar eses dous
     * scripts en liña, quítese aquí tamén e a CSP pasa a valer o dobre.
     *
     * `style-src` precisa `'unsafe-inline'` de por vida: os `:style` de Vue
     * (as barras de progreso, a opacidade das comarcas, a bandada) son
     * atributos en liña.
     */
    routeRules: {
      '/**': {
        headers: {
          'content-security-policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            // Commons serve as fotos da galería desde upload.wikimedia.org.
            "img-src 'self' data: https://upload.wikimedia.org",
            "media-src 'self'",
            "connect-src 'self'",
            "worker-src 'self'",
            "manifest-src 'self'",
            "base-uri 'none'",
            "object-src 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
          ].join('; '),
          // A app pide micrófono (identificar polo son) e localización (a túa
          // comarca). Aquí conténse a si mesma: só para ela e para nada máis.
          'permissions-policy': 'geolocation=(self), microphone=(self), camera=(), payment=(), usb=()',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'x-content-type-options': 'nosniff',
        },
      },
    },

    prerender: {
      crawlLinks: true,
      // O mapa e o robots non están enlazados desde ningunha páxina, así que o
      // rastrexador non daría con eles: hai que pedilos explicitamente.
      routes: ['/', '/sitemap.xml', '/robots.txt'],
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
      link: [
        // O SVG leva o seu propio fondo, así que serve en tema claro e escuro;
        // o PNG de 32 px é o recambio para navegadores que non o admiten.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },

  css: ['~/assets/css/base.css'],
})
