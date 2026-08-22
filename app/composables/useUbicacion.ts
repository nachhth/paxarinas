export type EstadoUbicacion = 'inactiva' | 'buscando' | 'atopada' | 'erro'

export interface Posicion {
  lon: number
  lat: number
  /** Radio de incerteza en metros, tal e como o dá o navegador. */
  precision: number
}

const MENSAXES: Record<number, string> = {
  1: 'Non deches permiso para acceder á localización. Podes activalo nos '
    + 'axustes do navegador, ou escoller a zona a man no mapa.',
  2: 'Non se puido determinar onde estás. Baixo teito ou nun val pechado o '
    + 'sinal adoita non chegar.',
  3: 'Tardou de máis en localizarte. Téntao de novo ou escolle a zona a man.',
}

/**
 * Onde está quen usa a app, para poder dicirlle que aves hai onde está.
 *
 * A xeolocalización do navegador non é unha API nosa: pídea o dispositivo e
 * nunca pasa por un servidor do proxecto, así que non rompe a regra de que a
 * app non fala con ninguén.
 *
 * O que se fai con ela: aquí, nada — úsase e tírase. O único sitio onde queda
 * escrita é `useVistas`, que apunta onde viches cada ave, e iso vai no
 * `localStorage` do propio dispositivo e pódese borrar desde «As miñas aves».
 */
export function useUbicacion() {
  const estado = ref<EstadoUbicacion>('inactiva')
  const posicion = ref<Posicion | null>(null)
  const erro = ref<string | null>(null)

  function dispoñible() {
    return import.meta.client && 'geolocation' in navigator
  }

  function localiza() {
    if (!dispoñible()) {
      estado.value = 'erro'
      erro.value = 'Este navegador non sabe dicir onde estás.'
      return
    }

    estado.value = 'buscando'
    erro.value = null

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        posicion.value = {
          lon: coords.longitude,
          lat: coords.latitude,
          precision: coords.accuracy,
        }
        estado.value = 'atopada'
      },
      (fallo) => {
        estado.value = 'erro'
        erro.value = MENSAXES[fallo.code] ?? 'Non se puido determinar onde estás.'
      },
      {
        // Chega con acertar a comarca, que son decenas de quilómetros: pedir
        // alta precisión só serviría para acender o GPS e gastar batería.
        enableHighAccuracy: false,
        timeout: 15000,
        // Unha posición de hai cinco minutos segue valendo para isto, e
        // aforra unha segunda localización.
        maximumAge: 5 * 60 * 1000,
      },
    )
  }

  function esquece() {
    estado.value = 'inactiva'
    posicion.value = null
    erro.value = null
  }

  return { estado, posicion, erro, localiza, esquece }
}

/**
 * Onde estamos, unha soa vez e nunha promesa.
 *
 * `localiza()` está pensado para unha pantalla que amosa o estado mentres
 * busca. Ao marcar unha ave non hai tal pantalla: quérese a posición se chega,
 * e se non chega non pasa nada, así que aquí vale mellor un `await` que tres
 * refs. Nunca rexeita: quen chama non ten que envolver isto nun `try`, porque
 * ningún fallo de localización pode estragar unha marca.
 *
 * `preciso` acende o GPS. Para escoller comarca non fai falta —son decenas de
 * quilómetros— pero para apuntar onde viches un paxaro si: a localización por
 * rede pode errar quilómetros, e daría igual gardala.
 */
export function onde({ preciso = false } = {}): Promise<Posicion | null> {
  if (!import.meta.client || !('geolocation' in navigator)) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        lon: coords.longitude,
        lat: coords.latitude,
        precision: coords.accuracy,
      }),
      () => resolve(null),
      {
        enableHighAccuracy: preciso,
        timeout: preciso ? 20000 : 15000,
        maximumAge: 5 * 60 * 1000,
      },
    )
  })
}
