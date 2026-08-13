// Servidor estatico do spike. Porto 5199 (non 3000 nin 3123).
//
// Serve por HTTP e, se hai certificado en cert/, tamen por HTTPS no porto 5199+1.
// O HTTPS fai falta para probar no movil: getUserMedia() so funciona en
// contextos seguros, e http://<ip-da-lan> NON o e (localhost si).
//
//   npm run cert     xera un certificado autoasinado con openssl
//   npm run serve

import { createServer } from 'node:http'
import { createServer as createServerTls } from 'node:https'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(RAIZ, 'public')
const PORTO = Number(process.env.PORTO || 5199)

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.opus': 'audio/ogg'
}

// Os cantos do catálogo, SÓ LECTURA e só para validar o spike con audio real.
// Non se copia nada: móntanse onde xa están.
const CANTOS = join(RAIZ, '..', '..', 'public', 'media', 'cantos')

async function atender (req, res) {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const rel = normalize(ruta === '/' ? '/index.html' : ruta).replace(/^([/\\])+/, '')
  const enCantos = rel.startsWith('cantos' + '\\') || rel.startsWith('cantos/')
  const base = enCantos ? CANTOS : PUBLICO
  const ficheiro = enCantos ? join(CANTOS, rel.slice(7)) : join(PUBLICO, rel)
  if (!ficheiro.startsWith(base)) { res.writeHead(403).end('403'); return }
  try {
    const datos = await readFile(ficheiro)
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ficheiro)] || 'application/octet-stream',
      'Content-Length': datos.length,
      // Sen caché de navegador: queremos medir descargas reais, non aceleradas.
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(datos)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`404 ${rel}`)
  }
}

function ips () {
  return Object.values(networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address)
}

createServer(atender).listen(PORTO, () => {
  console.log(`HTTP   http://localhost:${PORTO}`)
})

const chave = join(RAIZ, 'cert', 'key.pem')
const cert = join(RAIZ, 'cert', 'cert.pem')
if (existsSync(chave) && existsSync(cert)) {
  const opcions = { key: await readFile(chave), cert: await readFile(cert) }
  createServerTls(opcions, atender).listen(PORTO + 1, () => {
    console.log(`HTTPS  https://localhost:${PORTO + 1}`)
    for (const ip of ips()) console.log(`       https://${ip}:${PORTO + 1}   ← para o móbil`)
  })
} else {
  console.log('\nSen certificado en cert/. O micrófono NON funcionará dende o móbil.')
  console.log('Xera un con:  npm run cert')
  for (const ip of ips()) console.log(`   (sen HTTPS: http://${ip}:${PORTO} só serve para ver a páxina)`)
}
