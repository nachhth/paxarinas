/**
 * Lanza a precarga do modelo de son cando a app queda en repouso.
 *
 * Espera a que a páxina estea cargada e o fío principal libre: os 49 MB non
 * poden competir coas fotos que a persoa está a mirar nese momento. Faino unha
 * soa vez por sesión, e todas as comprobacións (conexión, preferencia, se xa
 * está cacheado) están en `precargaSon`.
 */
export default defineNuxtPlugin(() => {
  // 20 segundos: tempo dabondo para que quen abre a app e pecha non chegue a
  // baixar nada, e pouco para quen se queda a mirar.
  const ESPERA = 20_000

  let lanzada = false

  function lanza() {
    if (lanzada) return
    lanzada = true
    precargaSon()
  }

  function programa() {
    const idle = (window as any).requestIdleCallback
    if (idle) idle(lanza, { timeout: 10_000 })
    else setTimeout(lanza, 2000)
  }

  if (document.readyState === 'complete') setTimeout(programa, ESPERA)
  else window.addEventListener('load', () => setTimeout(programa, ESPERA), { once: true })
})
