// Xera un certificado autoasinado en cert/ para poder probar no movil.
//
// Por que fai falta: getUserMedia() (o microfono) so existe en «contexto
// seguro». localhost conta como seguro, pero http://192.168.x.x NON, e o
// navegador do movil nin sequera ofrece o permiso: falla en silencio.
//
// O certificado leva no SAN as IPs desta maquina na LAN, que e o que Chrome
// mira (o Common Name levase ignorando dende 2017).

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const DIR = join(RAIZ, 'cert')

const ips = Object.values(networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address)

if (!ips.length) console.log('Aviso: non se atopou ningunha IP de LAN. Fago o certificado só para localhost.')

const alt = [
  'DNS.1 = localhost',
  'IP.1 = 127.0.0.1',
  ...ips.map((ip, n) => `IP.${n + 2} = ${ip}`)
].join('\n')

const conf = `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = paxarinas-spike
[ext]
subjectAltName = @alt
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt]
${alt}
`

await mkdir(DIR, { recursive: true })
const confPath = join(DIR, 'openssl.cnf')
await writeFile(confPath, conf)

const r = spawnSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
  '-keyout', join(DIR, 'key.pem'), '-out', join(DIR, 'cert.pem'),
  '-config', confPath
], { stdio: 'inherit' })

await rm(confPath, { force: true })

if (r.error || r.status !== 0) {
  console.error('\nNon se puido executar openssl. En Windows vén con Git for Windows:')
  console.error('  "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"')
  console.error('Engádeo ao PATH ou executa este script dende Git Bash.')
  process.exit(1)
}

console.log(`\nCertificado en cert/ para: localhost, 127.0.0.1, ${ips.join(', ') || '(sen IPs)'}`)
console.log('Agora  npm run serve  levanta tamén HTTPS.')
console.log('No móbil sairá o aviso de certificado non fiable: é o esperado.')
console.log('Hai que darlle a «Configuración avanzada → Acceder de todos os xeitos».')
