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
| Familias | 79 |
| Catálogo | 372 kB · Fotos: 34,5 MB · Despliegue: ~38 MB |

Funciona: listado con búsqueda y filtros (incluido **"vense en <mes>"**), ficha
por especie con barra de doce meses, página de créditos, PWA instalable, las
517 fichas prerenderizadas a HTML estático. Desplegado en Vercel desde GitHub
(`nachhth/paxarinas`).

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
                fenoloxia.py · build.py (fusiona todo)
data/           especies.json — el catálogo, versionado, fuente de verdad
public/media/   fotos, versionadas (Vercel construye desde GitHub)
app/            Nuxt 4: pages/, composables/useCatalogo.ts, types/catalogo.ts
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

**Las peticiones a Wikimedia van con pausa** (`PAXARINAS_PAUSA`, 0,35 s) y con
un User-Agent que lleva contacto real. Sin eso devuelve 429 en pocas decenas de
peticiones. Los errores de red se capturan como `OSError` + `HTTPException`:
`ConnectionResetError` no es un `URLError` y tumbaba el proceso.

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
| eBird | Checklist regional (500 spp), 1720 hotspots | Clave en `.env` |
| xeno-canto | Cantos | Clave en `.env`, **sin usar todavía** |
| RAG | Nomenclatura normativa | ⚠️ Pendiente de permiso |

**eBird no sirve para fenología**: su API 2.0 está pensado para observaciones
recientes y resúmenes, y no expone los datos semanales de los *bar charts*, que
solo existen en la web. Por eso la fenología sale de GBIF.

Al pedir la clave de eBird se declaró que **no se redistribuirían registros
individuales ni datos de observadores**, solo agregados. Es un compromiso real
que condiciona qué se puede hacer con esa fuente.

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

1. **Cantos de xeno-canto** — la clave ya está en `.env`. Restringir a
   grabaciones con licencia CC y guardar autoría igual que con las fotos.
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
- **Probar en un móvil real.** El CSS está pensado para móvil y se corrigieron
  los objetivos táctiles y el scroll de la tabla de créditos, pero nunca se ha
  abierto en un dispositivo. Dos cosas a vigilar: la rejilla renderiza ~390
  tarjetas sin virtualización, y la instalación de la PWA se traga 12 MB de
  precache de golpe.

## Comandos

```bash
npm run dev / generate / typecheck     # app
python etl/gbif_especies.py            # base: especies y taxonomía
python etl/wikidata_nomes.py           # nombres gallegos que faltan
python etl/wikimedia_fotos.py          # fotos (~10 min, 34 MB)
python etl/fenoloxia.py                # distribución mensual y estatus
python etl/build.py                    # fusiona todo → data/especies.json
```

Las credenciales van en `.env` (fuera del repositorio; ver `.env.example`).
Los ETL cachean en `etl/.cache/` y saltan lo ya descargado, así que se pueden
reejecutar sin coste.
