<script setup lang="ts">
/**
 * A data dos datos vai no rodapé de todas as páxinas. Nunha guía de natureza
 * importa saber de cando é o que estás a ler: as citas, a fenoloxía e o estado
 * de conservación cambian, e un catálogo sen datar envellece en silencio.
 */
const catalogo = useCatalogo()
const dataDatos = computed(() => dataLonga(catalogo.rexistro?.data))
</script>

<template>
  <div class="sitio">
    <!-- Con teclado, saltar dous enlaces de menú en cada páxina é pouco; con
         lector de pantalla e o listado de 400 tarxetas, non. -->
    <a class="só-lectores" href="#contido">Ir ao contido</a>

    <header class="cabeceira">
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
