<template>
  <div class="sitio">
    <header class="cabeceira">
      <NuxtLink to="/" class="marca">
        <span class="marca__nome">Paxariñas</span>
        <span class="marca__lema">As aves de Galicia</span>
      </NuxtLink>
    </header>

    <main class="contido">
      <NuxtPage />
    </main>

    <footer class="rodape">
      <p>
        Proxecto libre e sen ánimo de lucro. Datos de
        <a href="https://www.gbif.org">GBIF</a>, fotografías de
        <a href="https://commons.wikimedia.org">Wikimedia Commons</a>.
        <NuxtLink to="/creditos">Créditos e licenzas</NuxtLink>.
      </p>
    </footer>
  </div>
</template>
