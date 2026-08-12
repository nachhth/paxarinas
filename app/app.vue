<template>
  <div class="sitio">
    <header class="cabeceira">
      <NuxtLink to="/" class="marca">
        <img class="marca__icona" src="/marca.svg" width="34" height="24" alt="">
        <span class="marca__nome">Paxariñas</span>
        <span class="marca__lema">As aves de Galicia</span>
      </NuxtLink>

      <nav class="menú">
        <NuxtLink to="/">Todas</NuxtLink>
        <NuxtLink to="/mapa">Por comarca</NuxtLink>
      </nav>
    </header>

    <main class="contido">
      <NuxtPage />
    </main>

    <footer class="rodape">
      <p>
        Proxecto libre e sen ánimo de lucro. Datos de
        <a href="https://www.gbif.org">GBIF</a>, fotografías de
        <a href="https://commons.wikimedia.org">Wikimedia Commons</a>.
        <NuxtLink to="/creditos">Créditos e licenzas</NuxtLink> ·
        <NuxtLink to="/sen-conexion">Uso sen conexión</NuxtLink>.
      </p>
    </footer>
  </div>
</template>
