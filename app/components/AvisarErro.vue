<script setup lang="ts">
import type { Especie } from '~/types/catalogo'

/**
 * Aviso de erros.
 *
 * Boa parte do contido sae de heurísticas: que foto de Commons é do paxaro e
 * cal non, en que meses se ve, se un nome de Wikidata é galego de verdade, onde
 * recortar unha foto vertical. Todas fallan de cando en vez, e ninguén as vai
 * pillar mellor que quen coñece as aves. Sen unha vía para avisar, eses erros
 * quedan aí para sempre.
 *
 * Vai a issues de GitHub: sen infraestrutura que manter e coa conversa pública.
 * A contrapartida é que fai falta conta, e moita xente que sabe de paxaros non
 * a ten. Aquí non se pon un correo como alternativa: iría en claro nas 517
 * fichas dun sitio estático, que é un enderezo servido en bandexa a calquera
 * rastrexador de spam. Se algún día fai falta esa segunda vía, que sexa un alias
 * dedicado ou un formulario, non a conta persoal de ninguén.
 */
const props = defineProps<{ especie?: Especie }>()

const REPO = 'https://github.com/nachhth/paxarinas'

const url = computed(() =>
  import.meta.client ? window.location.href : '')

const asunto = computed(() =>
  props.especie
    ? `Erro en ${props.especie.nomes.gl ?? props.especie.cientifico}`
    : 'Erro en Paxariñas')

const corpo = computed(() => {
  const e = props.especie
  const liñas = [
    'Que ves mal? (marca o que corresponda)',
    '',
    '- [ ] A foto non é desta especie, ou non é unha foto do paxaro',
    '- [ ] O nome galego non é correcto',
    '- [ ] O canto non se corresponde',
    '- [ ] Os meses en que aparece non cadran',
    '- [ ] Outra cousa',
    '',
    'Detalles:',
    '',
    '',
    '---',
  ]
  if (e) liñas.push(`Especie: ${e.cientifico} (${e.slug})`)
  if (url.value) liñas.push(`Páxina: ${url.value}`)
  return liñas.join('\n')
})

const ligazonGitHub = computed(() =>
  `${REPO}/issues/new?title=${encodeURIComponent(asunto.value)}`
  + `&body=${encodeURIComponent(corpo.value)}`)
</script>

<template>
  <p class="avisar">
    Ves algo mal nesta páxina?
    <a :href="ligazonGitHub" rel="noopener">Avísao en GitHub</a>
  </p>
</template>

<style scoped>
.avisar {
  margin: 0;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}
</style>
