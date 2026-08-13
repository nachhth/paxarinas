# Spike: BirdNET en el navegador — resultado

> ## ⚠️ El bloqueo de licencia de este documento está RESUELTO
>
> La sección 7 dejaba como "pendiente bloqueante" que el kernel STFT venía de
> `georg95/birdnet-web`, sin licencia declarada. Ya no se usa nada de ahí:
>
> - **El modelo** se baja del repositorio oficial de Cornell, que publica él
>   mismo la conversión a TensorFlow.js. Los 13 shards son **byte a byte
>   idénticos** a los que bajaba este spike: aquel repositorio era un espejo.
> - **El kernel STFT ya no existe.** Las dos capas del mel-espectrograma se
>   sacan del grafo y el espectrograma se calcula en JavaScript, con FFT propia.
>
> Contrastado sobre estos mismos 40 cantos: **mismo puesto en 40/40 especies**,
> mismo 75% top-1 y 85% top-3. Detalles y licencias en
> [`etl/birdnet/README.md`](../../etl/birdnet/README.md); la comparación la
> reproduce `validar-limpo.mjs`.
>
> Lo demás de este documento sigue vigente, con dos correcciones de cifras:
> ahora se descargan **49,1 MB** en vez de 59,3 (el meta-modelo de área queda
> fuera) y el arranque es más rápido porque ya no hay shaders de STFT que
> compilar. **Sigue sin medirse nada en un móvil real.**

Fecha: 13 de agosto de 2026. Escrito en castellano porque es documentación
interna, como el resto de `docs/`.

**Pregunta que responde este spike:** ¿aguanta un navegador la inferencia de
BirdNET en local, o hay que envolver la app con Capacitor y publicar en tiendas?

**Respuesta corta:** el navegador aguanta con holgura *en escritorio*, y el
cuello de botella no es la inferencia sino los **59,3 MB de pesos**. El
veredicto completo está al final; falta la medida en un móvil real, que es la
única que no se ha podido tomar aquí.

> ⚠️ **Todas las cifras de tiempo son de ESCRITORIO.** Portátil Intel Core
> Ultra 7 155H, GPU integrada Intel Arc, 32 GB, Windows 11, Chromium 151.
> Un móvil de gama media rinde bastante peor. No hay ninguna extrapolación en
> este documento: lo que no se ha medido, se dice que no se ha medido.

---

## 1. Qué se ha montado

Todo vive en `spike/birdnet/` y **no toca la app**. Lee `data/especies.json` y
`public/media/cantos/` en solo lectura; no escribe nada fuera de su carpeta.

| Fichero | Qué hace |
|---|---|
| `descargar-modelo.mjs` | Baja BirdNET v2.4 convertido a TensorFlow.js desde `georg95/birdnet-web` |
| `vendor.mjs` | Copia TF.js y el backend WebGPU a `public/vendor/` |
| `xerar-galegas.mjs` | Cruza las 6.522 etiquetas del modelo con el catálogo → `public/galegas.json` |
| `servidor.mjs` | Servidor estático en el puerto 5199 (+ HTTPS en 5200 si hay certificado) |
| `cert.mjs` | Certificado autofirmado con las IPs de la LAN en el SAN (para el móvil) |
| `public/index.html` + `public/worker.js` | La página de prueba y el worker de inferencia |
| `medir.mjs` | **Mide carga e inferencia** con Playwright, sin intervención humana |
| `filtro.mjs` | **Mide la reducción** del espacio de búsqueda, ejecutando el meta-modelo de área de verdad |
| `validar.mjs` | Pasa cantos reales de xeno-canto por la cadena completa y mira si acierta |

Lo que había del intento anterior estaba bien pero incompleto: faltaba
`public/vendor/` (el worker hacía `importScripts('/vendor/tf.min.js')` de un
fichero que no existía), faltaba `galegas.json`, `package.json` apuntaba a un
`medir.mjs` inexistente y a un `npm run cert` que no estaba escrito. Todo eso
está arreglado. Además se corrigieron dos cosas reales:

- **El paquete unión `@tensorflow/tfjs` no incluye el backend WebGPU.** Sin
  `@tensorflow/tfjs-backend-webgpu`, `tf.setBackend('webgpu')` devuelve `false`
  siempre y todo caía en WebGL sin decir por qué. Con él, WebGPU sí entra.
- **Dos especies del catálogo apuntaban al mismo índice del modelo**
  (`Anas carolinensis`→`Anas crecca` y `Larus smithsonianus`→`Larus argentatus`,
  vía la tabla de sinónimos). Habría hecho que la app mostrara un nombre gallego
  que no es el que el modelo predice. Ahora los sinónimos solo se aplican si el
  índice sigue libre, y las colisiones se registran.

Reproducir todo:

```bash
cd spike/birdnet
npm install
npm run prep      # descarga el modelo (~60 MB), copia TF.js, genera galegas.json
npm run medir     # tiempos de carga e inferencia
npm run filtro    # reducción del espacio de búsqueda
npm run validar   # acierto sobre cantos reales
```

---

## 2. Peso: la cifra que manda

Medido en `medicions.json` (bytes reales de los ficheros descargados):

| Pieza | Bytes | MB |
|---|---:|---:|
| Modelo principal (`model.json` + 13 shards) | 52 215 312 | **52,2** |
| Meta-modelo de área | 7 085 660 | 7,1 |
| Etiquetas (`en_uk.txt` + `es.txt`) | 516 740 | 0,5 |
| **Total del repositorio del modelo** | **59 817 712** | **59,8** |

Lo que la página descarga **de verdad en tiempo de ejecución** son 59 300 972 B
(**59,3 MB**), contados interceptando `fetch` dentro del worker: el modelo y el
meta-modelo de área. Las etiquetas no se bajan; en su lugar va `galegas.json`
(86 kB), que ya trae solo las especies gallegas con su nombre e índice.

**Comprimir no salva:** los pesos son float32, con poca redundancia.

| | Bruto | gzip | brotli (q5) |
|---|---:|---:|---:|
| Modelo principal | 52,2 MB | 47,6 MB | 47,5 MB |

Un 9% de ahorro. La palanca de verdad sería **cuantizar** en el conversor de
TF.js (`--quantize_uint16` ≈ mitad, `--quantize_uint8` ≈ cuarta parte). **No se
ha probado**: requiere rehacer la conversión desde el modelo de Keras y volver a
medir el acierto, y eso ya no es un spike. Queda anotado como la vía obvia si el
peso resulta ser el bloqueo.

---

## 3. Tiempos de carga (escritorio)

5 cargas en frío, página nueva cada vez, servidor con `Cache-Control: no-store`
para que no haya caché de navegador. Mediana de 5.

| | WebGPU | WebGL |
|---|---:|---:|
| Descarga + parseo del modelo | 713 ms | 736 ms |
| Meta-modelo de área | 173 ms | 152 ms |
| Primera inferencia (compilación de shaders) | 3 935 ms | 1 746 ms |
| **Total hasta poder predecir** | **5 537 ms** | **3 096 ms** |

Tres avisos importantes sobre estos números:

1. **Los 713 ms de "descarga" son desde `localhost`.** Ahí no hay red: eso mide
   parseo y subida de los pesos a la GPU. Por red real hay que sumar el tiempo
   de bajar 59,3 MB, y eso depende solo de la conexión. Aritmética, no medida:
   a 10 Mb/s son ~48 s; a 50 Mb/s, ~9,5 s; a 2 Mb/s (4G malo en el monte), ~4
   minutos.
2. **La primera carga absoluta del navegador es mucho peor.** En WebGL, la
   primera de las cinco tardó 14 715 ms en la primera inferencia y 1 700 ms las
   otras cuatro: es la caché de shaders de Chromium, que persiste en el perfil.
   Con WebGPU pasa lo mismo en menor medida. O sea: **el primer uso tras
   instalar la app va a ser notablemente más lento que cualquier medida de
   aquí**, y en un móvil eso se nota.
3. WebGL sale *mejor* que WebGPU en carga solo por la compilación de shaders,
   no por la descarga.

---

## 4. Tiempos de inferencia (escritorio)

21 repeticiones por medida, con una pasada de calentamiento previa que no se
cuenta. Ruido sintético, así que no depende del micrófono ni de permisos: es la
medida comparable entre dispositivos. Un fragmento = 3 s de audio.

### WebGPU

| Fragmentos | Audio | Mediana | Mín–Máx | p95 | Por fragmento de 3 s | Factor tiempo real |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 s | **50,9 ms** | 40–67 | 66 | 50,9 ms | 59× |
| 5 | 15 s | 147,9 ms | 100–171 | 166 | 29,6 ms | 101× |
| 10 | 30 s | 182,5 ms | 156–224 | 205 | **18,3 ms** | 164× |

### WebGL

| Fragmentos | Audio | Mediana | Mín–Máx | p95 | Por fragmento de 3 s | Factor tiempo real |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 s | **73,8 ms** | 64–98 | 85 | 73,8 ms | 41× |
| 5 | 15 s | 93,1 ms | 77–158 | 123 | 18,6 ms | 161× |
| 10 | 30 s | 155,3 ms | 138–249 | 216 | **15,5 ms** | 193× |

Memoria de TF.js en cualquiera de los casos: 66,6 MB de tensores.

**Lectura:** en escritorio la inferencia sobra. 3 segundos de audio se procesan
en 51–74 ms, entre 41 y 59 veces más rápido que el tiempo real, y por lotes
llega a 164–193×. Grabar 9 s y analizarlos es instantáneo en la práctica. **Hay
un margen enorme antes de que un móvil deje de ser usable**: incluso siendo 20
veces más lento que este portátil, seguiría siendo 2× tiempo real.

### Sin GPU no hay plan B

`tf.setBackend('cpu')` **falla**, y no por lento:

```
Error: Kernel 'STFT' not registered for backend 'cpu'
```

El mel-espectrograma de BirdNET necesita una RFFT que TF.js no expone como
kernel usable dentro de una capa Keras convertida. `worker.js` la resuelve con
un kernel propio escrito en GLSL y en WGSL — o sea, **solo existe para WebGL y
para WebGPU**. Un dispositivo sin ninguno de los dos no puede ejecutar esto en
absoluto; no hay degradación elegante, hay error. (Es el mismo obstáculo por el
que la conversión a ONNX no es viable.) En la práctica cualquier móvil de la
última década tiene WebGL, pero conviene saber que el suelo es duro y que hay
que detectarlo y decirlo, no fallar en silencio.

---

## 5. El filtro a la lista gallega: funciona

### Cómo se aplica

Hay tres mecanismos posibles, y no son excluyentes:

- **A · Filtrado posterior de las salidas** (el que usa el spike). El modelo
  siempre calcula sus 6.522 salidas — no se puede podar la última capa sin
  reconvertirlo — pero solo se *miran* los índices de las especies gallegas.
  `xerar-galegas.mjs` cruza las etiquetas de BirdNET (taxonomía Clements/eBird)
  con `data/especies.json` (backbone de GBIF) y produce `galegas.json`, un mapa
  índice-del-modelo → especie. Coste en tiempo: cero. Coste en peso: 86 kB.
- **B · El meta-modelo de área de BirdNET.** Un segundo modelo (7,1 MB) que come
  `(lat, lon, semana)` y devuelve una probabilidad por especie. Se ejecuta en
  ~150 ms una sola vez. Es de Cornell, no nuestro.
- **C · La fenología del catálogo.** Cada especie lleva `fenoloxia.meses` con el
  reparto de citas por mes; se descarta la que no tiene ninguna cita en el mes
  actual. Las 168 especies **sin** fenología fiable no se descartan: descartarlas
  sería inventar.

### Cuánto reduce cada uno (medido, no estimado)

`filtro.mjs` ejecuta de verdad el meta-modelo de área en el navegador para el
centro de Galicia (42,75 N, −8,0 O) y para la semana central de cada mes, con el
umbral 0,03 que usa BirdNET-Analyzer por defecto.

| Estrategia | Candidatas | % de las 6.522 |
|---|---:|---:|
| Sin filtro | 6 522 | 100% |
| **A** · catálogo gallego | **465** | 7,1% |
| A, solo habituales (sin raras/divagantes) | 365 | 5,6% |
| **B** · solo meta-modelo de área (media de los 12 meses) | 109,4 | 1,7% |
| **A+C** · gallegas del mes | 404,9 | 6,2% |
| A+C, solo habituales del mes | **304,9** | 4,7% |
| **A+B** · gallegas ∩ área | 106,9 | 1,6% |
| **A+B+C** · las tres | 104,7 | 1,6% |

Por meses (columna "solo área" = mecanismo B; "gallegas+mes" = A+C):

| Mes | Solo área | Gallegas | Gallegas+mes | Habituales+mes | Gallegas+área | Las tres |
|---|---:|---:|---:|---:|---:|---:|
| ene | 95 | 465 | 392 | 292 | 93 | 92 |
| feb | 99 | 465 | 389 | 289 | 97 | 96 |
| mar | 109 | 465 | 409 | 309 | 107 | 106 |
| abr | 122 | 465 | 420 | 320 | 119 | 116 |
| may | 112 | 465 | 407 | 307 | 109 | 105 |
| jun | 108 | 465 | 381 | 281 | 105 | 101 |
| jul | 120 | 465 | 390 | 290 | 117 | 114 |
| ago | 125 | 465 | 417 | 317 | 122 | 120 |
| sep | 118 | 465 | 423 | 323 | 115 | 112 |
| oct | 104 | 465 | 427 | 327 | 102 | 100 |
| nov | 95 | 465 | 409 | 309 | 93 | 92 |
| dic | 106 | 465 | 395 | 295 | 104 | 102 |

**Conclusiones del filtro:**

- El paso de 6.522 a las de Galicia funciona y es barato: **465 especies, un
  7,1%**. De las 517 del catálogo, 465 tienen clase en BirdNET (**93,1% de las
  habituales**: 365 de 392). 50 no tienen correspondencia y 2 se descartaron
  por colisión de índice.
- **El acotado por mes reduce poco** (465 → 405 de media, un 13%). Tiene sentido:
  el catálogo es de Galicia entera y muchas especies tienen alguna cita en casi
  todos los meses. La combinación útil de verdad es **habituales del mes: 305**.
- **El meta-modelo de área es, con diferencia, el filtro más agresivo**: deja
  ~109 especies de media, un 1,7%. Casi todas caen dentro de las gallegas
  (A+B = 106,9 de 109,4), lo cual es una validación cruzada agradable: dos
  fuentes independientes —las citas de GBIF en Galicia y el modelo de Cornell—
  coinciden.
- Pero **B cuesta 7,1 MB y A cuesta 86 kB**, y A lleva la nomenclatura gallega,
  que es el valor del proyecto. **Recomendación: A+C obligatorio, B opcional.**
  Si se prescinde del meta-modelo de área, el modelo baja de 59,3 a 52,2 MB.

### Y además funciona de verdad

`validar.mjs` pasa cantos reales de xeno-canto (los que ya tiene el catálogo en
`public/media/cantos/`, 15 s, opus) por la cadena completa: decodificación,
remuestreo a 48 kHz, inferencia, filtrado a las gallegas.

Muestra: las **40 primeras especies habituales por orden alfabético** que tienen
canto — orden fijo, no elegidas a dedo, pero por eso mismo cargada de anátidas y
bisbitas.

| | |
|---|---:|
| Especie correcta en la posición 1 | **30/40 (75%)** |
| Entre las 3 primeras | 34/40 (85%) |
| Entre las 5 primeras | 35/40 |

Los fallos son explicables: `Aegypius monachus` (buitre negro, prácticamente
afónico, el corte no tiene vocalización útil), `Accipiter nisus`, `Alcedo
atthis` y `Actitis macularius`. **No es una evaluación formal** —muestra de 40,
una grabación por especie, sin control de calidad ni de ruido— pero demuestra
que la cadena entera está bien montada: si hubiera un error de remuestreo, de
orden de la ventana o de mapeo de índices, el acierto sería ~0%, no 75%.

---

## 6. Cómo probarlo en tu móvil

Esto es lo único que no se puede medir desde aquí, y es justo el dato que decide.

### Antes de nada

```bash
cd spike/birdnet
npm install
npm run prep          # solo la primera vez: descarga ~60 MB
npm run cert          # certificado autofirmado con la IP de tu LAN
npm run serve
```

La consola imprimirá algo así:

```
HTTP   http://localhost:5199
HTTPS  https://localhost:5200
       https://192.168.1.139:5200   ← para el móvil
```

### En el móvil

1. Conéctalo al **mismo wifi** que el portátil.
2. Abre en Chrome (Android) o Safari (iOS) la URL `https://<tu-ip>:5200` que
   imprimió la consola.
3. Saldrá un aviso de **certificado no fiable**. Es lo esperado: el certificado
   te lo has hecho tú. Dale a *Configuración avanzada → Acceder de todos modos*
   (en iOS: *Mostrar detalles → Visitar este sitio web*).
4. Comprueba arriba que pone **"contexto seguro"**. Si pone "NO seguro", el
   micrófono no va a funcionar; ver más abajo.

**Por qué hace falta HTTPS:** `getUserMedia()` solo existe en *contexto seguro*.
`localhost` cuenta como seguro aunque sea HTTP, pero `http://192.168.x.x` **no**,
y el navegador ni siquiera ofrece el permiso: falla en silencio. De ahí el
certificado.

**Si el certificado da problemas**, hay dos alternativas:

- *Android con cable USB*: `adb reverse tcp:5199 tcp:5199` y luego abre
  `http://localhost:5199` en el móvil. Al ser localhost cuenta como contexto
  seguro y no hace falta certificado ninguno. Es la vía más limpia.
- *Chrome de Android*: en `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
  añade `http://192.168.1.139:5199` y reinicia el navegador.

### Qué hacer en la página, y en este orden

1. **"Cargar modelo"**. Apunta el total. Ojo: son 59 MB por wifi, tarda.
2. **"15× un fragmento (3 s)"** y **"15× cinco fragmentos (15 s)"**. Esta es la
   medida clave, la que compara con las tablas de arriba. No necesita permisos.
3. **"Grabar e identificar"** con 9 segundos. Si no hay pájaros, prueba
   poniéndole a la app un canto sonando en otro dispositivo.
4. Pulsa **"Copiar el registro"** y pégalo donde sea. Ahí va todo: modelo de
   GPU, backend elegido, tiempos y resultados.

### Lo que interesa saber

- ¿Qué backend coge, WebGPU o WebGL? ¿Qué GPU declara?
- La **mediana de un fragmento**: aquí son 51 ms (WebGPU) / 74 ms (WebGL).
  Mientras esté por debajo de ~1 500 ms sigue siendo más rápido que el tiempo
  real y la funcionalidad es viable.
- ¿Se queda sin memoria? El modelo ocupa 66,6 MB de tensores; en un móvil con
  poca RAM libre el navegador puede matar la pestaña. Si se recarga sola, ese es
  el resultado y es importante.
- ¿Se calienta o se va la batería? Un análisis puntual no debería, pero conviene
  mirarlo.
- En iOS: ¿deja `AudioContext` a 48 kHz o lo fuerza a 44,1? La página lo detecta
  y remuestrea, y lo dice en el registro.

---

## 7. Veredicto

> ### Basta con una PWA. No hace falta Capacitor por rendimiento.
>
> Con la reserva explícita de que **falta la medida en un móvil real**, y de que
> el peso obliga a un cambio de arquitectura en la descarga (no en la app).

El razonamiento:

1. **La inferencia no es el problema.** 51 ms por fragmento de 3 s en escritorio,
   59× el tiempo real. El margen hasta ser inutilizable es de más de un orden de
   magnitud. Un móvil de gama media con WebGL suele ir entre 5 y 20 veces más
   lento que este portátil; incluso en el peor extremo seguiría siendo más
   rápido que el tiempo real. Envolver con Capacitor daría acceso a TFLite con
   delegado NNAPI/CoreML —más rápido, sin duda— pero es optimizar algo que no
   está apretando.
2. **El problema es el peso, y Capacitor no lo arregla.** 59,3 MB hay que
   bajarlos igual: dentro de un APK/IPA los bajaría la tienda en vez del
   navegador. Cambiaría cuándo se bajan, no cuántos son. Y a cambio: dos
   procesos de revisión, firma, cuentas de desarrollador (99 €/año en Apple) y
   la fricción de publicar cada cambio. Para un proyecto sin ánimo de lucro eso
   es un coste real y recurrente contra un beneficio que no está demostrado.
3. **La licencia empuja en la misma dirección.** Los modelos de BirdNET son
   **CC BY-NC-SA 4.0**. Distribuirlos dentro de un binario en Google Play y en
   la App Store es un terreno más resbaladizo que descargarlos bajo demanda
   desde el proyecto, y la cláusula *ShareAlike* con una app empaquetada da más
   que pensar. Que el proyecto sea sin ánimo de lucro salva la NC, pero no
   convierte el empaquetado en la opción cómoda.
4. **Lo que sí queda pendiente de confirmar en un móvil:** memoria (66,6 MB de
   tensores más el resto de la app pueden hacer que iOS mate la pestaña) y que
   `getUserMedia` + `AudioContext` se comporten en Safari. Si el navegador mata
   la pestaña por memoria de forma reproducible, **eso sí** obligaría a
   reconsiderar Capacitor. Es la única vía por la que este veredicto se cae.

### Cómo encaja con el precache de 15,7 MB

No encaja, y no debe encajar: **el modelo no puede ir al precache jamás**. 59 MB
frente a los 15,7 MB que tanto costó defender es multiplicar por cuatro la
instalación de la PWA, justo el presupuesto que se protegió sacando fotos y
cantos del precache y arreglando el mapa de las fichas.

La forma en que sí encaja:

- **`globIgnores` para todo lo que sea del modelo.** Igual que ya se hace con
  `public/data/galeria/`. El precache se queda como está, en 15,7 MB.
- **Descarga explícita y bajo demanda**, con la misma pauta que
  `/sen-conexion`: una pantalla que dice cuánto pesa, avisa de que mejor con
  wifi, muestra progreso y **pide `fetch` dejando que el service worker lo
  guarde con sus propias reglas `CacheFirst`**, sin duplicar nombres de caché.
  Esa decisión ya está tomada y documentada en ESTADO.md; aquí solo se aplica.
- **Persistencia:** una vez en la Cache API, el modelo sobrevive a los cierres
  del navegador. Conviene pedir `navigator.storage.persist()` antes de bajar 59
  MB, para que el navegador no los tire a la primera de cambio, y comprobar
  `navigator.storage.estimate()` para no empezar una descarga que no cabe.
- **El identificador es una función opcional, no la portada.** Quien solo quiera
  el catálogo y los nombres gallegos —que es el valor del proyecto— no debería
  descargar ni un byte del modelo. La app tiene que funcionar entera sin él.
- **Si el peso resulta ser el bloqueo real en móvil**, la palanca por orden:
  (1) prescindir del meta-modelo de área, −7,1 MB, midiendo qué se pierde;
  (2) cuantizar a uint16 en el conversor, ~−50%, midiendo qué acierto se pierde;
  (3) uint8, ~−75%, casi seguro con coste apreciable de acierto. **Ninguna de
  las tres se ha probado en este spike.**

### Licencias, para que no se pierda

| Pieza | Licencia | Consecuencia |
|---|---|---|
| Modelos BirdNET (Kahl et al.) | CC BY-NC-SA 4.0 | Sin ánimo de lucro: compatible. Hay que atribuir y no puede haber publicidad. |
| Código BirdNET-Analyzer | MIT | Sin problema. |
| `georg95/birdnet-web` (capa mel + kernels STFT) | **sin licencia declarada** | ⚠️ Vale para un spike. Para producción hay que pedírsela al autor o reimplementar la capa. **Es un pendiente bloqueante.** |
| Cantos de xeno-canto (usados en `validar.mjs`) | CC, ya atribuidos en el catálogo | Sin problema. |

Ese tercer punto es el riesgo legal que queda vivo, y no es menor: el kernel
STFT es exactamente la pieza sin la cual esto no funciona en el navegador.

---

## 8. Qué no se ha medido, dicho claro

- **Nada en un móvil.** Ni un solo número de este documento viene de un
  teléfono. Sección 6 para obtenerlos.
- **Tiempo de descarga por red real.** Todo va por `localhost`. Las cifras de
  "a 10 Mb/s tarda X" son una división, y están marcadas como tal.
- **Acierto del modelo con audio de campo.** Lo de la sección 5 es con
  grabaciones de xeno-canto, limpias y con la especie en primer plano. Un móvil
  a tres metros y con viento es otra cosa.
- **Consumo de batería y calentamiento.**
- **Versiones cuantizadas del modelo.**
- **Safari / iOS**, en ninguna de sus versiones. Chromium en escritorio es lo
  único que se ha ejecutado.
