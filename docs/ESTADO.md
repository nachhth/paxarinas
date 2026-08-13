# Estado del proyecto — punto de partida para una sesión nueva

Actualizado: 12 de agosto de 2026.

Lee también [DESEÑO.md](../DESEÑO.md) (decisiones técnicas y roadmap) y
[README.md](../README.md) (cómo arrancar). Este documento es el contexto que no
se deduce leyendo el código.

## Qué es Paxariñas

Guía e identificador de las aves de Galicia, en gallego. Libre, gratuita, sin
ánimo de lucro y sin publicidad. El hueco que llena: Merlin Bird ID (Cornell)
cubre la península ibérica pero solo en castellano, portugués o inglés, con
modelo cerrado y sin nomenclatura gallega. No existe nada equivalente en
gallego — solo la lista de nomes de la RAG y un contador de aves de la SGO.

**El valor diferencial es la nomenclatura tradicional gallega**, no la
tecnología. Cualquier decisión que la debilite va en contra del proyecto.

## Estado actual: v0 (catálogo) casi cerrada

| Métrica | Valor |
|---|---|
| Especies con citas en Galicia | 517 (393 habituales + 125 raras/divagantes) |
| Con nombre gallego | 450 (87%) — 331 de Catalogue of Life, 119 de Wikidata |
| Con foto | 506 (98%), de Wikimedia Commons con autoría y licencia |
| Con fenología fiable | 313 (61%) |
| Con canto | 374 (72%) |
| Familias | 79 |
| Comarcas con aves contadas | 53 (204 especies de media) |
| Catálogo | 477 kB · Zonas: 188 kB · Fotos: 34,5 MB · Cantos: 15,1 MB |
| Despliegue generado | 1942 ficheros, 56,5 MB |

Rutas: `/` catálogo · `/identificar` guiada · `/escoitar` por sonido ·
`/mapa` comarcas · `/vistas` lista personal · `/creditos` · `/sen-conexion`.

Funciona: listado con búsqueda y filtros (incluido **"vense en <mes>"**), ficha
por especie con barra de doce meses **y mapa de en qué comarcas está citada**,
**mapa general por comarcas con "onde estou"**,
página de créditos, PWA instalable, las 517 fichas prerenderizadas a HTML
estático. Desplegado en Vercel desde GitHub (`nachhth/paxarinas`).

Reparto de estatus: 198 escasa · 101 estival · 77 invernante · 72 residente ·
64 de paso · 6 sin datos. Las 198 "escasa" son las que tienen menos de 50
citas, casi todas divagantes.

## Arquitectura, en una frase

Un ETL en Python descarga y normaliza datos externos a `data/especies.json`;
Nuxt empotra ese catálogo en el bundle en tiempo de compilación y genera un
sitio estático. **La app nunca llama a una API externa en runtime.**

```
etl/            common.py (HTTP con caché, ritmo, reintentos, lector de .env)
                gbif_especies.py · wikidata_nomes.py · wikimedia_fotos.py
                fenoloxia.py · xenocanto_cantos.py · zonas.py
                build.py (fusiona todo)
data/           especies.json — el catálogo, versionado, fuente de verdad
                zonas.json — las 53 comarcas y las aves de cada una
public/media/   fotos, versionadas (Vercel construye desde GitHub)
app/            Nuxt 4: pages/, components/, composables/, types/catalogo.ts
```

## Decisiones que conviene no revertir sin saber por qué

**El catálogo se importa, no se pide por red.** `useFetch` sobre `public/` no
resuelve durante el prerender y deja las páginas vacías; ya se probó. Además,
empotrado garantiza el funcionamiento offline, que es el caso de uso real: la
app se usa en el monte, sin cobertura.

**Las especies raras necesitan el hook `prerender:routes`.** No se enlazan
desde la portada (van tras un filtro), así que el crawler no las encontraría.

**Wikimedia solo sirve anchos de una lista cerrada** (20, 40, 60, 120, 250,
330, 500, 960…) y rechaza el resto; pedir 640 devuelve 960. Por eso las fotos
son de 250 y 500 px.

**El service worker precachea solo las miniaturas** (7,4 MB); las de 500 px van
por `CacheFirst` en runtime. Precachear los 30 MB completos haría inviable la
instalación con datos móviles.

**La atribución vive dentro del objeto `foto` de cada especie**, no en una
tabla aparte, para que sea imposible mostrar una imagen sin sus créditos. El
ETL descarta cualquier foto sin licencia constatada.

**La descarga offline (`/sen-conexion`) no escribe en la Cache API.** Pide los
880 ficheros con `fetch` y deja que el service worker los guarde con las reglas
`CacheFirst` que ya existen. Si duplicase aquí los nombres de caché, cualquier
cambio en `nuxt.config.ts` dejaría huérfano lo bajado por esa vía. Detecta si no
hay service worker activo y lo dice, en vez de fingir que descarga a ninguna
parte.

**Las peticiones a Wikimedia van con pausa** (`PAXARINAS_PAUSA`, 0,35 s) y con
un User-Agent que lleva contacto real. Sin eso devuelve 429 en pocas decenas de
peticiones. Los errores de red se capturan como `OSError` + `HTTPException`:
`ConnectionResetError` no es un `URLError` y tumbaba el proceso.

**El mapa no lleva teselas.** Es un SVG de las 53 comarcas dibujado en el
dispositivo. Una capa de OpenStreetMap dejaría el mapa en blanco justo donde se
va a usar. Se pierde el detalle del terreno; se gana que funcione sin cobertura.

**El polígono simplificado de cada comarca es uno solo**, y sirve a la vez para
preguntarle a GBIF qué aves hay, para dibujar el mapa y para situarte. Si fueran
distintos, la comarca que te sale marcada podría no ser aquella de la que se
contaron las aves. Medido contra los polígonos originales de OSM: **99% de los
puntos caen en la comarca correcta**, 0,79% no caen en ninguna (ahí se ofrece la
más próxima, avisando de que es aproximada) y 0,3% caen en la vecina.

**GBIF rechaza los polígonos por URL larga y por geometría inválida**, y en los
dos casos con un 400 sin explicación. Tres cosas que costaron encontrar:
Douglas-Peucker sobre un anillo cerrado degenera (el segmento inicio-fin mide
cero) y **cruza el polígono consigo mismo**; al simplificar la costa las puntas
de una ría se cruzan y hay que deshacer el lazo; y **redondear las coordenadas
puede invalidar un polígono que era válido**, así que se redondea antes de
validar, no después. El límite práctico está en unos 130 vértices.

**`zonas.json` va en un fichero aparte del catálogo.** Queda en su propio chunk
(200 kB, 58 kB gzip) que cargan `/mapa` y las fichas de especie —los dos sitios
donde hay mapa—, pero no la portada ni los créditos. Dentro del catálogo se lo
tragaría todo el mundo. Si algún día hace falta quitárselo a las fichas, la vía
es guardar en `especies.json` solo los índices de comarca de cada ave y dejar la
geometría bajo demanda.

**`inlineStyles` está desactivado.** Nuxt incrusta por defecto el CSS de cada
componente dentro de cada página prerenderizada, así que con 517 fichas que
comparten estilos cada regla se multiplica por 517: añadir dos bloques a la
ficha subió el precache de 17 a 22 MB. Con una hoja compartida, la ficha volvió
de 20 a 14 kB y el precache a 18,2. En un sitio que se precachea entero, la hoja
compartida gana siempre.

**Lo que se renderiza en servidor y es igual en las 517 fichas, se multiplica
por 517 — y va directo al precache.** El mapa de la ficha se renderizaba en SSR
e incrustaba los 81 kB de geometría de las 53 comarcas en cada página: las
fichas pasaron de 5 a 99 kB, el despliegue de 56 a 101 MB y **el precache de 15
a 61 MB**, que era justo el presupuesto que protegimos sacando fotos y cantos.
Se arregló envolviendo el mapa en `<ClientOnly>` con un hueco reservado: la
geometría ya viaja en un chunk compartido y cacheado, así que mandarla una vez
por página era pura repetición. No era un problema de resolución del polígono,
sino de repetición — bajar los vértices habría sido tirar de la palanca
equivocada. **Ante cualquier componente pesado y común a todas las fichas, mirar
el número de precache que imprime `nuxt generate`.**

**La galería es la única parte que necesita conexión, y es deliberado.** Sus
fotos siguen alojadas en Commons; solo se guardan los metadatos, en
`public/data/galeria/`, excluidos del precache con `globIgnores`. Se cargan al
pulsar y no solas, porque Wikimedia dice que enlazar directamente a sus imágenes
"es posible, pero no está recomendado". Las obligaciones de licencia siguen
intactas aunque no alojemos el fichero, así que cada foto muestra su autoría.

## Identificación por sonido: `/escoitar`

BirdNET GLOBAL 6K v2.4 corriendo **en el dispositivo**, sin servidor. El sonido
grabado no sale del teléfono.

**La licencia estaba bloqueada y se desbloqueó sin pedir permiso a nadie.** El
spike daba por hecho que el modelo TFJS y los kernels STFT venían ambos de un
repositorio sin licencia. Resultó que:

- Cornell **publica él mismo la conversión a TensorFlow.js** (etiqueta `v1.5.1`
  de BirdNET-Analyzer, la última con los checkpoints dentro). Verificado por
  md5: los 13 shards son byte a byte idénticos. Aquel repositorio era un espejo.
- El problema real era solo el kernel STFT, **y se eliminó en vez de
  sustituirse**. La capa mel oficial usa `tf.signal.stft`, medida en **27
  segundos** por fragmento de 3 s (DFT O(n²) en WebGL, inexistente en CPU). Se
  sacaron las dos capas mel del grafo y el mel-espectrograma se calcula en JS
  con FFT propia: **25 ms**. Mil veces más rápido y sin depender de WebGL ahí.

Validación idéntica al spike, no parecida: 75% top-1 y 85% top-3 sobre 40 cantos
reales, y **las 40 especies en el mismo puesto**. 48,5 ms por fragmento.

**El modelo son 49 MB versionados en `public/birdnet/`.** Nunca en el precache
(`globIgnores` + regla `CacheFirst`), descarga bajo demanda. El repo pasa de ~50
a ~100 MB y el despliegue a ~117 MB: **es la decisión que más conviene revisar**,
por los límites de Vercel. Los scripts ETL son deterministas, así que cambiar a
descargar-en-el-build sigue siendo posible.

El meta-modelo de área queda fuera: en la conversión oficial pesa 33,6 MB, no
los 7,1 del espejo. El filtro por lista gallega y mes hace el mismo trabajo por
86 kB.

## El ETL se ejecuta con un solo comando, y deja fecha

`python etl/todo.py` corre las doce etapas en orden. Admite `--rapido` (salta
fotos y cantos, que son las lentas), `--so <etapa>` y `--desde <etapa>`. Si una
fuente falla sigue —son independientes— salvo GBIF, que es la base de todo.

Cada ejecución escribe `etl/out/rexistro.json` con la fecha y el recuento de
cada fuente, **con fecha por fuente y no solo global**: una ejecución parcial
mezcla datos de días distintos y eso tiene que verse. `build.py` copia esa fecha
al catálogo y el pie de todas las páginas dice "Datos actualizados o …".

## Filtrar lo que no es el pájaro

Las categorías de taxón en Commons traen mapas, ilustraciones, huevos,
esqueletos — y **gente**. El caso que lo destapó: una foto de un ornitólogo con
el ave en la mano, en la galería de *Circus macrourus*, con título en neerlandés
y autoría normal. Por el título no había nada que rascar; estaba en
`Category:Ornithologists`. Las categorías vienen en la misma petición que las
imágenes, así que filtrar por ellas no cuesta ni una llamada más.

**Cuidado con pasarse.** Un primer intento descartaba también `nests`, y con eso
se iban fotos de cigüeñas sobre el nido, que son excelentes fotos de cigüeña. Un
pájaro en su nido sí es el pájaro; un pájaro en la mano de alguien, no. Cada
término de la lista costó una comprobación, y sigue siendo una heurística:
habrá más intrusos.

## Lista personal: `/vistas`

Marcar aves vistas, con fecha, en `localStorage`. **Sin cuentas y sin servidor**:
no sale del dispositivo. La contrapartida es que no sincroniza y se pierde al
borrar los datos del navegador, y por eso hay exportación a CSV — ese es el
seguro, no un extra.

Todo lo que lee `localStorage` va dentro de `<ClientOnly>`: en el prerender no
existe, y sin eso la hidratación no cuadraría con el HTML estático.

## Identificación guiada: `/identificar`

Es **el uso real de la app**: alguien ve un pájaro, no sabe cómo se llama y
quiere llegar a él. Buscar por nombre solo sirve a quien ya lo sabe.

Los rasgos vienen de AVONET (CC BY 4.0): masa, ala, hábitat y nicho trófico de
11.009 especies, cruzados con nuestras 517 por nombre científico contra sus tres
taxonomías alternativas (BirdLife, eBird, BirdTree) — **513 de 517 casan**.

Dos decisiones que mandan sobre el resto:

- **Ningún filtro es obligatorio.** Un asistente de pasos fijos acaba en cero
  resultados sin que sepas qué respondiste mal. Aquí cada respuesta recorta y se
  ve al momento cuánto recorta.
- **Se ordena por número de citas, no alfabéticamente.** Quien ve un pájaro está
  casi siempre viendo uno de los comunes. Poner el merlo antes que una divagante
  con tres citas es la respuesta probable, no un capricho.

El mes va puesto de entrada pero visible y desactivable: es el filtro que más
recorta y el que nadie pensaría en poner.

**Especies parecidas** (`parecidas` en el catálogo, 96% de cobertura): misma
familia y masa cercana, comparada en escala logarítmica — entre 8 y 16 gramos
hay la misma diferencia aparente que entre 800 y 1600. Deliberadamente
conservador: dos aves de la misma familia y el mismo porte son las que de verdad
se confunden. Contrastado a ojo: el paporrubio sale junto a papoazul, chasco y
rousinol; la gaivota patiamarela con todo el complejo de gaivotas grandes.
Su límite conocido: no captura confusiones de silueta entre tamaños distintos,
como *Accipiter nisus* y *A. gentilis*.

**Falta el color, y es el hueco más grande.** No existe ninguna fuente abierta
que lo recoja para 11.000 especies, y en una herramienta de identificación un
color inventado es peor que ningún color. Queda como curación manual: ~400
especies, y es el trabajo que más acercaría esto a Merlin.

**Cuidado con los identificadores no ASCII.** El escaneo de auto-importación de
Nuxt no reconoce nombres con `ñ`: una función `habitatsDispoñibles` exportada
desde un composable no se importa y falla el typecheck sin explicar por qué.

**Los filtros viven en la URL, no solo en `ref`s.** Al volver atrás desde una
ficha, el componente de la portada se recrea; si el estado viviera solo en
locales, la lista que se pinta sería otra —las 393 enteras— y la posición que el
router restaura, medida sobre la lista filtrada, caería casi al principio. Se
midió en Chrome real: con búsqueda puesta, el documento pasaba de 37 998 px de
alto a 141 593. En `/mapa` era peor: la comarca desaparecía, el listado iba tras
un `v-if` y la página encogía de 19 990 px a 1 027, recortando el scroll de 2500
a 183. **El `scrollBehavior` de Nuxt nunca fue el problema** y por eso no hay
`router.options.ts`: restaura al píxel cuando la lista es la misma.
La búsqueda escribe en la URL con 300 ms de retardo porque `replaceState` está
limitado por número de llamadas y, al pasarse, Safari lanza y vue-router cae a
recargar la página entera.

**TypeScript fijado a la serie 5.** `vue-tsc` no funciona con TypeScript 7, que
eliminó el subpath `./lib/tsc`. El `tsconfig.json` raíz solo referencia los que
Nuxt genera en `.nuxt/`.

## Fuentes de datos

| Fuente | Aporta | Estado |
|---|---|---|
| GBIF | Especies, taxonomía, citas, distribución mensual | ✔ Sin clave |
| Catalogue of Life (vía GBIF) | 331 nombres gallegos | ✔ CC BY |
| Wikidata | 119 nombres gallegos más | ✔ Sin clave |
| Wikimedia Commons | 506 fotos con autoría | ✔ CC |
| OpenStreetMap | Fronteras de las 53 comarcas | ✔ ODbL, atribuida en créditos |
| AVONET | Tamaño, hábitat y dieta de 513 especies | ✔ CC BY 4.0 |
| Wikipedia gl/es | Descripción de 493 especies (443 en gallego) | ✔ CC BY-SA |
| UICN vía Wikidata | Estado de conservación de 479, 32 amenazadas | ✔ Sin clave |
| eBird | Checklist regional (500 spp), 1720 hotspots | Clave en `.env` |
| xeno-canto | 374 cantos con autoría | Clave en `.env` |
| RAG | Nomenclatura normativa | ⚠️ Pendiente de permiso |

**eBird no sirve para fenología**: su API 2.0 está pensado para observaciones
recientes y resúmenes, y no expone los datos semanales de los *bar charts*, que
solo existen en la web. Por eso la fenología sale de GBIF.

Al pedir la clave de eBird se declaró que **no se redistribuirían registros
individuales ni datos de observadores**, solo agregados. Es un compromiso real
que condiciona qué se puede hacer con esa fuente. Lo que sí se usa: sus
**hotspots**, que son sitios públicos con un recuento histórico de especies.
1534 con 20+ especies, cruzados contra los polígonos de comarca; 1293 situados,
241 en mar o islas exteriores, y las 53 comarcas tienen alguno.

**El contraste con eBird no reveló ninguna especie que falte**, aunque a primera
vista lo pareciera. De las 58 "solo en eBird", 21 son híbridos y formas
domésticas —que eBird trata como taxones y GBIF no— y 37 son renombres:
`Astur gentilis` es nuestro *Accipiter gentilis*, `Gulosus aristotelis` es
*Phalacrocorax aristotelis*. Es divergencia entre la taxonomía Clements de eBird
y el backbone de GBIF, no un hueco de cobertura. Queda anotado en el JSON para
que nadie lo lea al revés.

**Se guardan también las especies con una sola cita en una comarca.** Un umbral
de tres dejaba fuera del mapa 87 especies, y eran justo las divagantes: para un
ave vista una vez, esa cita es el dato. Cuesta un 20% más de pares zona-especie
(~10 kB). Ahora solo queda sin mapa *Egretta gularis*. Lo que no se puede hacer
con esto es deducir abundancia — pero eso ya se advierte en todas partes.

**Las comarcas no salen de GADM**, que es la división que usa el resto del ETL:
su nivel 3 en España no corresponde a las comarcas (A Coruña tiene 3) y devuelve
los nombres como `n.a. (145)`. OSM sí las tiene delimitadas y con `name:gl`. La
provincia de cada una viene de Wikidata por el QID que OSM ya trae en las
etiquetas, con un respaldo por coordenadas contra GADM: hay alguna comarca que
en Wikidata cuelga de Galicia y no de su provincia.

**Los cantos se eligen por proximidad geográfica antes que por calidad.** Hay
subespecies con voces distintas — el paporrubio canario sin ir más lejos — así
que una grabación de Tenerife no vale en una guía gallega. La búsqueda cascadea:
Galicia y entorno → noroeste ibérico → España → cualquier lugar. Todas las
especies comunes acaban con grabación local; las 147 remotas son nórdicas y
divagantes nunca grabadas en Iberia.

**Se descartan las licencias ND.** Recortar a 15 s y recodificar a Opus crea una
obra derivada, y esas licencias no lo permiten. Requiere `ffmpeg`; tras
instalarlo, las consolas ya abiertas siguen con el PATH viejo, y para eso está
`PAXARINAS_FFMPEG`.

**Wikidata mete falsos positivos**: cuando una especie no tiene nombre popular
en gallego, `rdfs:label` devuelve el propio nombre científico. Se filtran 27 así.
Cualquier fuente nueva de nombres necesita el mismo cuidado.

## La fenología es una estimación, no un dato

`etl/fenoloxia.py` faceta por mes las ocurrencias gallegas de cada especie —
eso es dato duro de GBIF. El **estatus** (residente, estival, invernante, de
paso) lo deduce una heurística sobre esa distribución, y eso no es criterio
experto. La app lo dice explícitamente en cada ficha y muestra la barra de doce
meses al lado, para que se vea la evidencia junto a la interpretación.

Contrastada contra 11 especies de estatus conocido: **10 aciertos**. El fallo
es *Ciconia ciconia*, clasificada como "de paso" cuando es estival: las cigüeñas
ibéricas crían temprano (febrero-junio) e invernan aquí cada vez más, así que no
encajan en la ventana abril-septiembre. Es un caso biológico real, no un bug.

Un intento anterior contaba "meses por encima del 3%" para decidir residente, y
clasificaba como residentes a los migradores de paso, que aparecen casi todo el
año en cantidades ínfimas entre sus dos picos. La regla actual exige que
**ningún mes baje del 4%**. Si se toca este criterio, ejecutar
`python etl/valida_fenoloxia.py`, que contrasta contra especies de estatus
conocido y sale con código 1 si hay regresiones.

Es lo primero que debería revisar la SGO si colabora.

## Lo siguiente

1. **Revisar el mapa en un móvil.** El listado de una comarca de costa pasa de
   250 filas sin virtualizar, y las comarcas pequeñas del interior son difíciles
   de acertar con el dedo (por eso hay también un selector). Falta comprobar que
   la geolocalización se comporta con permiso denegado y bajo techo.
2. **Spike de BirdNET en el navegador** — la única incógnita que puede obligar
   a cambiar de arquitectura. Si la inferencia no rinde en un móvil real, hay
   que envolver con Capacitor y publicar en tiendas. Mejor saberlo pronto.
3. **Identificación guiada** — figura como v1 en el diseño pero la dejaría para
   después: necesita rasgos (tamaño, color, hábitat) que no están en ninguna
   fuente abierta decente y habría que curarlos a mano.

## Pendiente fuera del código

- **Correo enviado a la SGO el 12 de agosto de 2026**, a la espera de
  respuesta. Se les plantea usar la nomenclatura normativa de la RAG y se les
  pide criterio ornitológico sobre el contenido. **La carta a la RAG sigue sin
  enviarse**: la idea era esperar a la SGO, que participó en la elaboración de
  esa lista y cuyo apoyo da peso a la petición. Borradores en
  [contactos-nomenclatura.md](contactos-nomenclatura.md). Nada de esto bloquea
  el desarrollo (ya hay 87% de cobertura), pero es el techo de calidad.
  Si la SGO responde, lo primero que conviene pedirles es que revisen los
  estatus fenológicos estimados.
- **El móvil ya se probó** y todo iba bien, salvo la pérdida de posición al
  volver de una ficha, que está corregida. Queda sin comprobar en un dispositivo
  real: el gesto nativo de "atrás", el back después de que el sistema expulse la
  página por memoria, y el comportamiento dentro de la PWA en modo `standalone`.
  La rejilla de ~390 tarjetas sigue sin virtualizar, pero eso ya no afecta a la
  restauración de la posición: lo que fallaba era el estado de los filtros.
  Sigue en pie que la instalación descarga 16,2 MB de precache de una vez.

## Comandos

```bash
npm run dev / generate / typecheck     # app
python etl/gbif_especies.py            # base: especies y taxonomía
python etl/wikidata_nomes.py           # nombres gallegos que faltan
python etl/wikimedia_fotos.py          # fotos (~10 min, 34 MB)
python etl/fenoloxia.py                # distribución mensual y estatus
python etl/valida_fenoloxia.py         # regresiones de la clasificación
python etl/xenocanto_cantos.py         # cantos (~40 min, 15 MB, necesita ffmpeg)
python etl/zonas.py                    # comarcas y sus aves (~5 min)
python etl/build.py                    # fusiona todo → data/especies.json + zonas.json
```

Las credenciales van en `.env` (fuera del repositorio; ver `.env.example`).
Los ETL cachean en `etl/.cache/` y saltan lo ya descargado, así que se pueden
reejecutar sin coste.
