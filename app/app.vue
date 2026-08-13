<template>
  <div class="sitio">
    <!-- Con teclado, saltar dous enlaces de menú en cada páxina é pouco; con
         lector de pantalla e o listado de 400 tarxetas, non. -->
    <a class="só-lectores" href="#contido">Ir ao contido</a>

    <header class="cabeceira">
      <NuxtLink to="/" class="marca">
        <img class="marca__icona" src="/marca.svg" width="34" height="24" alt="">
        <span class="marca__nome">Paxariñas</span>
        <span class="marca__lema">As aves de Galicia</span>
      </NuxtLink>

      <nav class="menú">
        <!-- Vai primeiro e destacado: é a pregunta coa que chega a xente
             ("que paxaro é este?"), non un filtro máis do catálogo. -->
        <NuxtLink to="/identificar" class="menú__destacado">Que paxaro é?</NuxtLink>
        <NuxtLink to="/escoitar">Polo son</NuxtLink>
        <NuxtLink to="/">Todas</NuxtLink>
        <NuxtLink to="/mapa">Por comarca</NuxtLink>
        <NuxtLink to="/vistas">As miñas</NuxtLink>
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
      <p class="rodape__ligazóns">
        <NuxtLink to="/creditos">Créditos e licenzas</NuxtLink>
        <span aria-hidden="true">·</span>
        <NuxtLink to="/sen-conexion">Uso sen conexión</NuxtLink>
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* Destacado sen berrar: fondo propio e o amarelo do toxo diante, para que se
   distinga dos dous enlaces de catálogo sen romper a barra verde. */
.menú a.menú__destacado {
  gap: 0.4rem;
  font-weight: 650;
  background: rgb(255 255 255 / 14%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%);
}

.menú a.menú__destacado::before {
  content: '';
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--toxo);
  flex: none;
}

.menú a.menú__destacado:hover {
  background: rgb(255 255 255 / 24%);
}

/* Sen isto o subliñado do toxo que marca a páxina activa perderíase, porque a
   regra de arriba xa gasta a `box-shadow`. */
.menú a.menú__destacado.router-link-exact-active {
  background: rgb(255 255 255 / 26%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%), inset 0 -2px 0 var(--toxo);
}

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

.rodape__ligazóns span {
  color: var(--tinta-suave);
  opacity: 0.5;
}
</style>
