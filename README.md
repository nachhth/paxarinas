## Paxariñas

Guía e identificador das aves de Galicia, en galego. Proxecto libre e sen ánimo
de lucro.

Merlin Bird ID cobre a península ibérica, pero só en castelán, portugués ou
inglés, e sen a nomenclatura galega. Paxariñas quere encher ese oco.

Estado: **v0 — catálogo**. 517 especies con citas rexistradas en Galicia,
331 delas xa con nome galego.

### Posta en marcha

```bash
npm install
npm run dev            # http://localhost:3000
npm run generate       # sitio estático en .output/public
npm run typecheck      # comprobación de tipos
```

O `tsconfig.json` da raíz limítase a referenciar os que Nuxt xera en `.nuxt/`
ao correr `nuxt prepare`. Sen el o editor non resolve os alias `~` e `~~`.
TypeScript queda fixado á serie 5: `vue-tsc` aínda non funciona con TypeScript 7.

### Reconstruír o catálogo

O catálogo (`data/especies.json`) vai versionado no repositorio; só hai que
rexeneralo cando se queiran datos frescos ou se engada unha fonte nova.

```bash
# Wikimedia esixe un User-Agent cun contacto real e bloquea os xenéricos
export PAXARINAS_CONTACTO="o-teu-correo@exemplo.gal"

python etl/gbif_especies.py    # especies, taxonomía e nomes (uns minutos)
python etl/wikimedia_fotos.py  # fotos + autoría (~30 MB, uns 10 minutos)
python etl/wikidata_nomes.py   # nomes galegos que GBIF non trae
python etl/fenoloxia.py        # en que meses se ve cada especie
python etl/valida_fenoloxia.py # comproba a clasificación fenolóxica
python etl/xenocanto_cantos.py # cantos (~40 min, precisa ffmpeg)
python etl/zonas.py            # comarcas e as aves de cada unha
python etl/ebird_hotspots.py   # lugares de observación
python etl/commons_galeria.py  # galería só en liña: metadatos, non imaxes
python etl/avonet_rasgos.py    # tamaño, hábitat e dieta (identificación guiada)
python etl/build.py            # fusiona todo en data/especies.json
```

Os cantos recórtanse a 15 segundos e recodifícanse a Opus, así que fai falta
**ffmpeg** (`winget install Gyan.FFmpeg`). Tras instalalo hai que reiniciar a
consola, ou definir `PAXARINAS_FFMPEG` coa ruta ao executable.

As descargas van con pausa entre peticións (`PAXARINAS_PAUSA`, 0,35 s por
defecto) porque Wikimedia devolve 429 se se lle aperta. Se o proceso se corta,
volve executalo: salta o que xa está descargado.

As imaxes (`public/media/`) non van no repositorio; a súa autoría e licenza si,
dentro de `data/especies.json`.

A galería de cada ficha é a única parte da app que precisa conexión: as súas
fotos quedan aloxadas en Commons e só se gardan os metadatos, en
`public/data/galeria/`, fóra do precache. Cárganse ao premer, non soas, porque
Wikimedia desaconsella enlazar directamente ás súas imaxes.

### Como está organizado

```
etl/                    ETL en Python. Corre fóra de liña, nunca desde a app
├── common.py           HTTP con caché, ritmo e reintentos
├── gbif_especies.py    fonte: especies de aves con citas en Galicia
├── wikimedia_fotos.py  fonte: fotos con autoría e licenza
└── build.py            fusiona as fontes → data/especies.json
data/especies.json      o catálogo. Empótrase no bundle en compilación
public/media/fotos/     binarios, fóra do repositorio
app/                    Nuxt 4: páxinas, tipos, composables, estilos
docs/                   notas de traballo (permisos, decisións)
```

Detalle das decisións técnicas e do camiño previsto en [DESEÑO.md](DESEÑO.md).

### Fontes

Datos de distribución e taxonomía de [GBIF](https://www.gbif.org). Os nomes
vernáculos galegos proveñen de Catalogue of Life a través de GBIF. As
fotografías son de [Wikimedia Commons](https://commons.wikimedia.org),
localizadas a través de Wikidata; cada unha conserva a súa autoría e licenza,
visibles na ficha da especie e na páxina de créditos.
