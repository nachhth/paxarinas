# BirdNET: procedencia, licenzas y cómo regenerarlo

Escrito en castellano, como el resto de la documentación interna.

Estos scripts producen `public/birdnet/`, que es todo lo que necesita
`/escoitar` para identificar aves por el canto. **No se ejecutan en runtime ni
en el build**: como el resto del ETL, se lanzan a mano y su salida se versiona.

## Por qué existe esta carpeta: la licencia

El spike (`spike/birdnet/RESULTADO.md`) dejó una cosa bloqueante: dependía de
`georg95/birdnet-web`, **un repositorio sin licencia declarada**, del que salían
dos piezas — el modelo convertido a TensorFlow.js y unos kernels STFT en GLSL y
WGSL que calculaban el mel-espectrograma. Sin licencia eso no se puede publicar.

Las dos piezas se resolvieron por separado, y ninguna necesitó pedirle permiso a
nadie:

**El modelo nunca fue el problema.** El repositorio oficial de Cornell,
[`birdnet-team/BirdNET-Analyzer`](https://github.com/birdnet-team/BirdNET-Analyzer)
(código MIT), **ya publica él mismo la conversión a TensorFlow.js**, en
`birdnet_analyzer/checkpoints/V2.4/BirdNET_GLOBAL_6K_V2.4_Model_TFJS/`. Los 13
shards de pesos son **byte a byte idénticos** a los que bajaba el spike: aquel
repositorio no era más que un espejo. Ahora se bajan de la fuente, fijados a la
etiqueta `v1.5.1`, que es la última que lleva los checkpoints dentro del
repositorio (desde `v2.0.0` delegan en el paquete `birdnet` de PyPI).

**El kernel STFT sí lo era, y se ha eliminado en vez de sustituirlo.** El modelo
trae la STFT dentro del grafo, en dos capas Keras `MelSpecLayerSimple`. Cornell
publica también su propia reimplementación en JavaScript (MIT, en el `main.js`
de esa misma carpeta), que usa `tf.signal.stft` — así que la vía legal más corta
era copiar esa. **No se ha hecho, porque es inservible**: `tf.signal.stft` en
WebGL es un DFT O(n²) y en CPU ni siquiera existe como kernel. Medido en este
proyecto, tarda **27 segundos** por fragmento de 3 s. Por eso el otro repositorio
había escrito kernels propios.

Lo que se hace aquí es sacar las dos capas del grafo (`converter_espectro.mjs`) y
calcular el mel-espectrograma en JavaScript, con FFT propia
(`public/birdnet/melspec.js`, ~25 ms por fragmento, unas mil veces más rápido que
`tf.signal.stft`). Consecuencias:

- no queda ni una línea de código de terceros sin licencia;
- el espectrograma deja de necesitar WebGL/WebGPU (solo lo usa ya la red
  convolucional);
- `model.json` baja de 893 a 120 kB, porque los bancos de filtros mel iban
  dentro de la configuración de esas capas.

## Licencias de lo que se distribuye

| Pieza | Licencia | Obligación |
|---|---|---|
| Pesos y topología de BirdNET GLOBAL 6K v2.4 (Kahl et al.) | **CC BY-NC-SA 4.0** | Atribuir, **no comercial**, compartir igual. Está en `/creditos` y en `/escoitar`. |
| Código de BirdNET-Analyzer | MIT | — |
| TensorFlow.js 4.22.0 | Apache-2.0 | La licencia se guarda en `public/birdnet/vendor/`. |
| `melspec.js`, `worker.js`, estos scripts | La del proyecto | — |

**El recorte de las capas mel produce una obra derivada del modelo.** CC BY-NC-SA
lo permite: el proyecto no tiene ánimo de lucro ni publicidad (esa es
exactamente la razón por la que se eligió BirdNET, ver `DESEÑO.md`), se atribuye
y se comparte bajo las mismas condiciones. El script de conversión es
determinista y está aquí, así que cualquiera puede comprobar qué se cambió.

**Ya no hace falta pedirle la licencia a nadie.** Ese pendiente del spike queda
cerrado.

## Cómo regenerar `public/birdnet/`

```bash
node etl/birdnet/descargar_oficial.mjs    # ~78 MB de Cornell → etl/birdnet/orixinal/
node etl/birdnet/converter_espectro.mjs   # quita las capas mel → public/birdnet/modelo/
node etl/birdnet/xerar_galegas.mjs        # 6.522 etiquetas × catálogo → galegas.json
node etl/birdnet/vendor_tfjs.mjs          # TensorFlow.js → public/birdnet/vendor/
```

`etl/birdnet/orixinal/` está en `.gitignore` (es la descarga intacta, solo sirve
para reconvertir). `public/birdnet/` **sí se versiona**: el despliegue de Vercel
se construye desde GitHub, igual que con las fotos y los cantos. Son 51 MB de
una vez, sin churn: el modelo está fijado a la versión 2.4.

## Lo que queda fuera a propósito

**El meta-modelo de área de BirdNET** (lat, lon, semana → probabilidad por
especie). El spike midió que es el filtro más agresivo de los tres (deja ~109
especies frente a las 465 del catálogo), pero en la conversión oficial a TFJS
pesa **33,6 MB** — no los 7,1 MB de la versión de terceros que medía el spike —
y no aporta nomenclatura gallega. El filtro del catálogo cuesta 21 kB y deja 465
especies, y acotando al mes en curso y sin raras se queda en ~305. Esa es la
recomendación que ya daba el spike (A+C obligatorio, B opcional) y aquí se
cumple.

**Cuantizar los pesos.** Sigue sin probarse. Es la palanca obvia si los 49 MB
resultan ser un bloqueo real en móvil: `--quantize_uint16` los dejaría en la
mitad, a costa de un acierto que habría que volver a medir.

## Cómo comprobar que no se rompió nada

```bash
cd spike/birdnet
node comparar-melspec.mjs   # nuestro espectrograma vs. el oficial de Cornell
node diagnose-melspec.mjs   # de dónde sale la diferencia que queda
node validar-limpo.mjs      # 40 cantos reales, y compara con la cadena del spike
node probar-app.mjs         # /escoitar de verdad, con micrófono falso
```

`comparar-melspec.mjs` es la prueba que importa: ejecuta la
`MelSpecLayerSimple` oficial en TensorFlow.js y la contrasta con la nuestra. Si
alguien toca `melspec.js`, ahí se ve. Las diferencias que quedan son ruido de
redondeo de float32 — las dos implementaciones están a la misma distancia de una
DFT en float64, y `validar-limpo.mjs` confirma que las 40 especies quedan en el
**mismo puesto** que con la cadena del spike.

Detalles de aritmética que hay que respetar al tocar `melspec.js` están
comentados en el propio fichero. El más traicionero: de la STFT se toma la
**parte real**, no el módulo, porque eso es lo que hace el `tf.cast(spec,
'float32')` de la capa oficial. No es lo que haría un espectrograma de libro,
pero es lo que ve el modelo tal y como Cornell lo publica.
