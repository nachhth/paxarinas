# Paxariñas — Diseño técnico

Guía e identificador de aves de Galicia, en galego. Inspirado en Merlin Bird ID
(Cornell Lab), pero centrado en la avifauna gallega y en la nomenclatura
tradicional galega, que es justo lo que Merlin no cubre.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Naturaleza | Libre, sin ánimo de lucro | Desbloquea BirdNET (CC BY-NC-SA) y todo el ecosistema abierto |
| Primer entregable | Catálogo/guía en galego | Útil desde el día 1, sin IA; es la base de todo lo demás |
| Formato | PWA instalable, offline-first | Sin tiendas de apps; funciona en el monte sin cobertura |
| Stack | Nuxt (Vue) + `@vite-pwa/nuxt`, generación estática | Elección del autor; SSG ahora, rutas de servidor disponibles en v3 |
| ETL | Python | Los SDK de GBIF / xeno-canto / BirdNET son Python |
| Backend | **Ninguno de momento** | ~380 especies caben en pocos MB de ficheros estáticos |

La ausencia de backend en v0-v2 es deliberada, no una simplificación temporal
por pereza: una app 100% estática se despliega gratis, cachea entera en el
dispositivo y no depende de rate limits de terceros en campo. Postgres + PostGIS
entra en v3, cuando haya observaciones de usuarios que persistir.

## Arquitectura

```
etl/                        Python, se ejecuta a mano o por CI (no en runtime)
├── common.py               HTTP con caché en disco ✔
├── gbif_especies.py        ocurrencias en Galicia → lista de especies ✔
├── ebird.py                listas regionales ES-GA, fenología, hotspots
├── wikimedia_fotos.py      fotos CC + autoría y licencia por imagen ✔
├── wikidata.py             nomes galegos que faltan (label gl)
├── xenocanto.py            cantos y reclamos CC (requiere API key)
└── build.py                fusiona las fuentes → data/especies.json ✔

data/especies.json          el catálogo: versionado, fuente de verdad ✔
public/media/fotos/         binarios, fuera de git, regenerables ✔

app/                        Nuxt 4, `nuxt generate` → estático ✔
├── composables/            useCatalogo() ✔
├── pages/                  listado + ficha de especie ✔
└── types/                  contrato del catálogo ✔
```

Dos reglas clave:

**Las APIs externas nunca se llaman desde el navegador.** El ETL las vuelca al
catálogo, el catálogo se sirve estático. Aísla la app de caídas, cambios de API,
límites de cuota y falta de cobertura.

**El catálogo se empotra en el bundle en tiempo de compilación**, no se pide por
red. Así las 517 fichas se prerenderizan a HTML y no queda ninguna petición que
pueda fallar en el monte. Un `useFetch` sobre `public/` no resuelve durante el
prerender y deja las páginas vacías; esto ya se probó.

Las especies raras no se enlazan desde la portada (van tras un filtro), así que
el crawler no las encontraría. El hook `prerender:routes` de `nuxt.config.ts`
añade las 517 rutas explícitamente.

## Fuentes de datos

| Fuente | Aporta | Licencia / fricción |
|---|---|---|
| [GBIF](https://www.gbif.org) | Ocurrencias, distribución, taxonomía backbone | Abierta, sin key. Base del catálogo |
| [eBird API 2.0](https://documenter.getpostman.com/view/664302/S1ENwy59) | Especies presentes por región y época, hotspots | Key gratuita, uso no comercial |
| [xeno-canto v3](https://xeno-canto.org/explore/api) | **Cantos de 375 especies** | CC, API key. Ya integrado |
| Wikidata + Wikimedia Commons | **Fotos de 507 especies**, nomes en `gl` | CC. Fotos ya integradas con su autoría |
| iNaturalist | Fotos adicionales | CC variable, verificar por imagen |
| Catalogue of Life (vía GBIF) | **Nomes galegos de 331 especies** | CC BY. Ya integrado |
| [Nomes galegos das aves (RAG)](https://academia.gal/aves/presentacion) | Nomenclatura normativa, >8.000 especies | ⚠️ Sin API ni licencia declarada — **pedir permiso** |
| Macaulay Library | Fotos/audios excelentes | ❌ No redistribuibles. No usar |

### Nomenclatura

Es el valor diferencial del proyecto frente a Merlin.

GBIF ya sirve nombres gallegos para **331 de las 517 especies** (64%), y vienen
de Catalogue of Life, con licencia CC BY. Eso significa que el permiso de la RAG
**no es bloqueante**: hay base con la que arrancar. Las 186 restantes se
completan con las etiquetas `gl` de Wikidata.

Aun así, la lista normativa de la RAG sigue siendo deseable — cubre el 100%, es
la referencia oficial y recoge variantes dialectales. Buena parte del interés
está en que un paxaro tenga cinco nombres según la comarca. Gestión y borradores
de carta en [docs/contactos-nomenclatura.md](docs/contactos-nomenclatura.md).

## Roadmap

**v0 — Catálogo** *(en marcha)*
✔ Las **517** especies con citas en Galicia (393 habituales + 125 raras o
divagantes), con taxonomía, nombres en cuatro idiomas, volumen de citas,
búsqueda con filtros, PWA instalable y las 517 fichas prerenderizadas.
✔ Fotos de Wikimedia Commons con atribución, en dos tamaños.
✔ Fenología mensual de GBIF y filtro "vense en \<mes\>".
✔ Cantos de xeno-canto, recortados a 15 s y recodificados a Opus.
Falta: hábitat y descripción divulgativa de cada especie.

**Los cantos se eligen por proximidad geográfica antes que por nada más.**
Muchas especies tienen subespecies con voces distintas — el paporrubio canario
sin ir más lejos — así que una grabación de Tenerife no sirve en una guía
gallega. La búsqueda cascadea: Galicia y entorno → noroeste ibérico → España →
cualquier lugar. Resultado: todas las especies comunes tienen grabación local;
las 147 remotas son nórdicas y divagantes nunca grabadas en Iberia.

Recortar y recodificar crea una **obra derivada**, así que quedan descartadas
las licencias ND. Requiere `ffmpeg`.

**Presupuesto de almacenamiento offline.** Wikimedia solo sirve una lista
cerrada de anchos (20, 40, 60, 120, 250, 330, 500, 960…) y rechaza el resto;
pedir 640 devuelve 960. Con eso: 250 px pesa ~15 kB (7,4 MB las 517) y 500 px
~45 kB (22,7 MB). El service worker precachea el esqueleto, el catálogo y las
miniaturas; las de 500 px se cachean al visitar cada ficha. Precachear los
30 MB completos haría inviable la instalación con datos móviles.

Pendiente para cerrar el offline del todo: un botón de *descargar todo para uso
sen conexión* que fuerce la caché de las fotos grandes antes de salir al campo.

**v1 — Identificación guiada**
El equivalente al *Step-by-step ID* de Merlin: tamaño, colores, hábitat, época,
comportamiento. Sin IA, solo datos bien estructurados. Muy didáctico y barato de
construir sobre v0.

**v2 — Identificación por son**
[BirdNET](https://birdnet-team.github.io/BirdNET-Analyzer/) en TFLite corriendo
**en el dispositivo**. Filtrar las predicciones a la lista gallega reduce el
espacio de 6.500 especies a ~380 y dispara la precisión.
Código MIT, modelos CC BY-NC-SA → compatible con un proyecto sin ánimo de lucro.
Verificar antes el rendimiento de la inferencia en navegador móvil; si no da,
Capacitor o un endpoint de inferencia.

**v3 — Comunidade**
Observaciones de usuarios, listas personales, exportación a eBird/GBIF.
Aquí sí: Nuxt server routes + Postgres/PostGIS.

**Fuera de alcance de momento — identificación por foto.** No hay modelo abierto
comparable a BirdNET para imagen. Las opciones son la API de iNaturalist o
entrenar un clasificador propio, y ambas son un proyecto en sí mismas.

## Riesgos

- ~~**Licencia de la lista de la RAG.**~~ Mitigado: Catalogue of Life aporta el
  64% de los nombres gallegos con licencia CC BY. La RAG mejora la cobertura y
  la autoridad, pero ya no bloquea.
- ~~**Cadena de custodia de licencias en las imágenes.**~~ Resuelto por diseño:
  la atribución vive dentro del objeto `foto` de cada especie, no en una tabla
  aparte, así que no se puede mostrar una imagen sin sus créditos. El ETL
  descarta cualquier foto sin licencia constatada. Hay además una página
  `/creditos` con el listado completo.
- **BirdNET en el navegador.** El riesgo técnico principal de la v2. Hay que
  medirlo con un prototipo antes de comprometerse con la PWA pura.
- **Cobertura de audio gallega en xeno-canto.** Puede ser desigual por especie;
  medirlo en el ETL y marcar los huecos.
