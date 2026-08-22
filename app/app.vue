<script setup lang="ts">
/**
 * A data dos datos vai no rodapé de todas as páxinas. Nunha guía de natureza
 * importa saber de cando é o que estás a ler: as citas, a fenoloxía e o estado
 * de conservación cambian, e un catálogo sen datar envellece en silencio.
 */
const catalogo = useCatalogo()
const dataDatos = computed(() => dataLonga(catalogo.rexistro?.data))

/**
 * A cabeceira queda pegada arriba ao desprazar, así que o resto da app precisa
 * saber canto ocupa: as áncoras teñen que parar por debaixo dela e as barras
 * `sticky` das páxinas (o resumo de «Identificar», a cabeceira da táboa de
 * créditos) teñen que apoiarse nela e non quedar tapadas.
 *
 * Vai medido e non escrito a man porque o menú envolve en dúas filas segundo o
 * ancho e o tamaño de letra do sistema: calquera constante estaría mal na
 * metade das pantallas. Un `ResizeObserver` é o único que se decata tanto de
 * xirar o móbil coma de que a fonte tarde en cargar e a fila creza.
 */
const cabeceira = useTemplateRef<HTMLElement>('cabeceira')

let observador: ResizeObserver | undefined

onMounted(() => {
  if (!cabeceira.value || typeof ResizeObserver === 'undefined') return
  observador = new ResizeObserver(([entrada]) => {
    const alto = entrada?.borderBoxSize?.[0]?.blockSize ?? entrada?.contentRect.height ?? 0
    document.documentElement.style.setProperty('--cabeceira-alto', `${Math.round(alto)}px`)
  })
  observador.observe(cabeceira.value)
})

onBeforeUnmount(() => observador?.disconnect())
</script>

<template>
  <div class="sitio">
    <!-- Con teclado, saltar dous enlaces de menú en cada páxina é pouco; con
         lector de pantalla e o listado de 400 tarxetas, non. -->
    <a class="só-lectores" href="#contido">Ir ao contido</a>

    <header ref="cabeceira" class="cabeceira">
      <NuxtLink to="/" class="marca">
        <!-- 34×25 e non 34×24: o `viewBox` do paporrubio é 54×40 e cun 24 de
             alto o paxaro saía apertado de lados. -->
        <img class="marca__icona" src="/marca.svg" width="34" height="25" alt="">
        <span class="marca__nome">Paxariñas</span>
        <span class="marca__lema">As aves de Galicia</span>
      </NuxtLink>

      <!-- Etiquetas curtas a propósito: con cinco entradas, «Que paxaro é?» e
           «Por comarca» non caben nunha fila de 390 px e ou se parten en tres
           liñas ou obrigan a desprazar. A pregunta longa segue estando na
           portada, que é onde ten sitio para respirar. -->
      <nav class="menú">
        <!-- Vai primeira a propósito: é a pregunta coa que chega a xente, non
             un filtro máis do catálogo. A orde abonda; non leva resalte. -->
        <NuxtLink to="/identificar">
          <svg class="menú__icona" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" />
          </svg>
          <span>Identificar</span>
        </NuxtLink>
        <NuxtLink to="/escoitar">
          <svg class="menú__icona" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
          </svg>
          <span>Polo son</span>
        </NuxtLink>
        <NuxtLink to="/">
          <svg class="menú__icona" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          <span>Todas</span>
        </NuxtLink>
        <NuxtLink to="/mapa">
          <svg class="menú__icona" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3v15" />
          </svg>
          <span>Comarcas</span>
        </NuxtLink>
        <NuxtLink to="/vistas">
          <svg class="menú__icona" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>As miñas</span>
        </NuxtLink>
      </nav>

    </header>

    <main id="contido" class="contido">
      <NuxtPage />
    </main>

    <!-- ─── Barra inferior, só en móbil ──────────────────────────────────────
         Catro destinos e o son no medio, que é a acción e non un sitio.
         O menú de arriba segue existindo en pantalla ancha: alí caben as cinco
         entradas e unha barra flotando abaixo non ten sentido co rato. -->
    <nav class="barra" aria-label="Principal">
      <NuxtLink to="/" class="barra__ir">
        <svg class="barra__icona" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span>Aves</span>
      </NuxtLink>

      <NuxtLink to="/identificar" class="barra__ir">
        <svg class="barra__icona" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" />
        </svg>
        <span>Identificar</span>
      </NuxtLink>

      <NuxtLink to="/escoitar" class="barra__son" aria-label="Identificar polo son">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
        </svg>
      </NuxtLink>

      <NuxtLink to="/mapa" class="barra__ir">
        <svg class="barra__icona" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3v15" />
        </svg>
        <span>Comarcas</span>
      </NuxtLink>

      <NuxtLink to="/vistas" class="barra__ir">
        <svg class="barra__icona" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>As miñas</span>
      </NuxtLink>
    </nav>

    <footer class="rodape">
      <p>
        Proxecto libre e sen ánimo de lucro. Datos de
        <a href="https://www.gbif.org">GBIF</a>, fotografías de
        <a href="https://commons.wikimedia.org">Wikimedia Commons</a>.
      </p>
      <p v-if="dataDatos" class="rodape__data">
        Datos actualizados o {{ dataDatos }}.
      </p>
      <p class="rodape__ligazóns">
        <NuxtLink to="/creditos">Créditos e licenzas</NuxtLink>
        <span aria-hidden="true">·</span>
        <NuxtLink to="/sen-conexion">Uso sen conexión</NuxtLink>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/nachhth/paxarinas/issues/new" rel="noopener">
          Avisar dun erro
        </a>
      </p>
    </footer>
  </div>
</template>

<style scoped>

/* ─── Barra inferior ────────────────────────────────────────────────────────
   Fóra do móbil non existe: en pantalla ancha o menú de arriba xa colle as
   cinco entradas e unha barra flotando abaixo só quitaría sitio. */
.barra {
  display: none;
}

@media (max-width: 46rem) {
  .barra {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: grid;
    /* A columna do son é FIXA e máis ancha ca o círculo: 62 px de botón dentro
       de 86 deixan 12 de aire a cada lado. Con `auto` a columna medía o que o
       círculo e as etiquetas de «Identificar» e «Comarcas» quedaban pegadas a
       el. Os catro destinos repártense o resto. */
    grid-template-columns: repeat(2, 1fr) 86px repeat(2, 1fr);
    align-items: center;
    background: var(--papel);
    border-top: 1px solid var(--borde);
    /* A franxa do xesto de inicio nos móbiles sen botóns: sen isto o dedo cae
       enriba do sistema e non da barra. */
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* O menú de arriba pasa a ser só a marca: as súas entradas están aquí abaixo
     e nas dúas portas da portada. Repetilas era dúas filas de iconas. */
  .menú {
    display: none;
  }
}

.barra__ir {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-height: 56px;
  color: var(--tinta-suave);
  /* Con cinco entradas nun móbil de 390 px cada cela ten uns 70 px: «Identificar»
     non entra a 0,7rem sen partirse. Baixa a 0,64 e non se corta. */
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.1;
  text-align: center;
  text-decoration: none;
}

.barra__icona {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* A páxina en que estás. O laranxa só se usa aquí para dicir «estás aquí». */
.barra__ir.router-link-exact-active {
  color: var(--fento);
}

.barra__ir.router-link-exact-active::after {
  content: '';
  width: 18px;
  height: 2px;
  border-radius: 2px;
  background: var(--papo);
}

/* O son é a acción da app, non un destino máis: sae do carril e vai en círculo.
   62 px, moi por riba do mínimo táctil, porque se preme co paxaro cantando. */
.barra__son {
  justify-self: center;
  margin-top: -30px;
  width: 62px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--fento);
  color: var(--boton-tinta);
  box-shadow: 0 2px 4px rgb(26 31 22 / 18%), 0 10px 22px rgb(26 31 22 / 24%);
  transition: transform var(--saída);
}

.barra__son:active {
  transform: scale(0.94);
}

.barra__son svg {
  width: 27px;
  height: 27px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

/* «Identificar» xa non leva resalte propio: tiña fondo, borde e un punto laranxa
   permanentes, e nunha barra de cinco entradas iso líase como «estás aquí» en
   todas as páxinas. O que a destaca é ir primeira; a cor resérvase para marcar
   a páxina activa, que é o único que ten que dicir un menú coa cor. O estado
   activo vén de `.menú a.router-link-exact-active` en base.css, coma nos outros
   catro. */

/* As dúas ligazóns de servizo van nunha liña propia, separadas do texto de
   atribución: antes ían pegadas ao final do parágrafo e non se vían. */
.rodape__ligazóns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.35rem 0.6rem;
  margin-top: 0.4rem;
}

.rodape__ligazóns a {
  min-height: 2.25rem;
  display: inline-flex;
  align-items: center;
  padding: 0 0.15rem;
  border-radius: var(--raio-p);
}

/* De cando son os datos. Discreto, pero presente en todas as páxinas: unha
   guía sen datar non deixa saber se o que le é deste ano ou de fai tres. */
.rodape__data {
  font-size: 0.8rem;
  opacity: 0.75;
}

.rodape__ligazóns span {
  color: var(--tinta-suave);
  opacity: 0.5;
}
</style>
