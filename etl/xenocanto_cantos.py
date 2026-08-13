"""Fonte xeno-canto: dúas gravacións de cada especie, o canto e o reclamo.

Búscanse por separado. Antes collíase unha soa gravación por especie e ficaba a
que houbese máis preto, fose do tipo que fose: así o merlo rubio quedou
representado por un berro de alarma, que é o que dá cando se asusta e non o que
canta. Un reclamo non é peor material —na validación acertan igual de ben ca os
cantos— pero non substitúe o canto, do mesmo xeito que unha foto de xuvenil non
substitúe a do adulto. Agora hai unha praza para cada cousa e cada clip di o que
é.

Dentro de cada praza escóllese por proximidade xeográfica antes que por nada
máis. Moitas especies teñen subespecies con voces distintas — o paporrubio
canario, sen ir máis lonxe — así que unha gravación de Tenerife non serve para
unha guía galega. A busca vai en cascada: primeiro Galicia e o seu contorno,
logo o cuadrante noroeste ibérico, e só despois calquera lugar.

Descártanse as licenzas "sen obra derivada" (ND). Recortar e recodificar as
gravacións crea unha obra derivada, e iso esas licenzas non o permiten.

Uso:
    python etl/xenocanto_cantos.py            # metadatos e descarga
    python etl/xenocanto_cantos.py --so-meta  # só metadatos, sen baixar audio

Saída:
    etl/out/xenocanto_cantos.json
    public/media/cantos/*.opus
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

from common import (OUT_DIR, descarga_ficheiro, escribe_json, get_json, log,
                    slug, url_segura)

RAIZ = Path(__file__).resolve().parent.parent
DIR_CANTOS = RAIZ / "public" / "media" / "cantos"
DIR_TEMP = RAIZ / "etl" / ".cache" / "audio"

API = "https://xeno-canto.org/api/3/recordings"

# Tras instalar ffmpeg, os procesos xa abertos seguen co PATH vello ata que se
# reinician. PAXARINAS_FFMPEG permite apuntar ao binario sen reiniciar nada.
FFMPEG = os.environ.get("PAXARINAS_FFMPEG", "ffmpeg")

# Cascada de ámbitos de busca, de máis próximo a máis xeral.
AMBITOS = [
    ("Galicia e contorno", 'box:41.6,-9.6,44.0,-6.4'),
    ("noroeste ibérico", 'box:39.5,-10.0,44.0,-4.5'),
    ("península ibérica", 'cnt:Spain'),
    ("calquera lugar", ''),
]

# As dúas prazas. `busca` é o que se lle pide á API; `xenero` é como se nomea o
# ficheiro e como o le a web.
#
# `type:call` casa tamén con "alarm call" e "flight call", e iso convén: son
# reclamos e para moitas especies é o único que hai gravado. `type:song` casa
# con "subsong", que é canto a medio facer, e tamén vale.
PRAZAS = [
    ("canto", "song"),
    ("reclamo", "call"),
]

# Segundos que se conservan de cada gravación. Abondan para recoñecer unha voz
# e manteñen o total nunhas decenas de MB en vez de centos.
DURACION = 15


def licenza_url(url: str | None) -> str | None:
    """A URL da licenza, se é unha licenza de Creative Commons que nos serve.

    Devolve `None` para as licenzas sen obra derivada (imos recortar e
    recodificar) e para calquera cousa que non sexa unha URL de creativecommons.org.

    Compróbase o anfitrión, e non «contén creativecommons.org», que era o que
    había antes: esta URL vai a un `href` na ficha, e unha cadea como
    `javascript:x//creativecommons.org` pasaba a proba e quedaba nun enlace
    executable. Admítese tamén a forma sen esquema, que é como a devolveron
    algunhas versións da API.
    """
    if not url:
        return None
    limpo = url.strip()
    if limpo.startswith("//"):
        limpo = f"https:{limpo}"
    limpo = url_segura(limpo)
    if not limpo:
        return None
    anfitrion = urllib.parse.urlparse(limpo).hostname or ""
    if anfitrion != "creativecommons.org" and not anfitrion.endswith(".creativecommons.org"):
        return None
    return None if "-nd" in limpo.lower() else limpo


def puntua(rec: dict, busca: str) -> tuple:
    """Ordena as candidatas dunha praza: primeiro as máis típicas, logo curtas.

    `xacto` prefire un "call" limpo a un "alarm call, flight call": para
    representar unha especie interesa a voz de sempre, non a de cando se asusta.
    A calidade xa vén filtrada pola consulta, pero ordénase igual porque a
    segunda volta (a que quita o `q:A`) trae de todo.
    """
    tipo = (rec.get("type") or "").lower()
    xacto = tipo.strip() != busca
    calidade = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}.get(rec.get("q", "E"), 5)

    # Preferimos gravacións curtas: menos ruído de fondo e menos que descargar.
    try:
        m, s = (rec.get("length") or "0:00").split(":")
        segundos = int(m) * 60 + int(s)
    except ValueError:
        segundos = 999

    return (xacto, calidade, abs(segundos - 30))


def busca_gravacion(
    cientifico: str, clave: str, busca: str, excluir: set[str],
) -> dict | None:
    """A mellor gravación dun tipo, ou None se non hai ningunha utilizable.

    `excluir` leva os ids xa collidos por outra praza: hai gravacións
    etiquetadas "song, call" que casan coas dúas buscas, e sen isto a mesma
    pista saía dúas veces na ficha coma se fosen dous sons distintos.

    A cascada faise con `q:A`, que é o listón de sempre. Se ningún ámbito dá
    nada, próbase unha última vez sen restrición de calidade e sen restrición de
    lugar: para especies escasas adoita ser iso ou quedar sen o clip. Non se
    proba sen calidade en cada ámbito porque multiplicaría as peticións a un
    servizo que mantén xente voluntaria.
    """
    intentos = [(e, f'sp:"{cientifico}" type:{busca} q:A {a}'.strip())
                for e, a in AMBITOS]
    # Etiqueta propia e non "calquera lugar": esta volta afroixa a calidade
    # ademais do lugar, e se comparte etiqueta co cuarto ámbito non hai forma de
    # saber cantas gravacións entraron por baixo do listón de sempre.
    intentos.append(("calquera lugar, calquera calidade",
                     f'sp:"{cientifico}" type:{busca}'))

    for etiqueta, consulta in intentos:
        data = get_json(API, {"query": consulta, "key": clave})

        candidatas = [r for r in data.get("recordings", [])
                      if licenza_url(r.get("lic")) and url_segura(r.get("file"))
                      and str(r.get("id")) not in excluir]
        if not candidatas:
            continue

        mellor = sorted(candidatas, key=lambda r: puntua(r, busca))[0]
        mellor["_ambito"] = etiqueta
        return mellor

    return None


def ids_anteriores() -> dict[str, str]:
    """Que gravación (id de xeno-canto) hai detrás de cada ficheiro local.

    Le a saída da execución anterior, admitindo tanto o formato vello (un clip
    por especie, sen id gardado) coma o novo. No vello o id sácase da URL de
    orixe, que é o único sitio onde estaba.
    """
    ficheiro = OUT_DIR / "xenocanto_cantos.json"
    if not ficheiro.exists():
        return {}
    try:
        datos = json.loads(ficheiro.read_text(encoding="utf-8")).get("cantos", {})
    except (ValueError, OSError):
        return {}

    saida: dict[str, str] = {}
    for entrada in datos.values():
        for c in (entrada if isinstance(entrada, list) else [entrada]):
            ident = c.get("id") or (c.get("orixe") or "").rstrip("/").rsplit("/", 1)[-1]
            if ident and c.get("ficheiro"):
                saida[c["ficheiro"]] = str(ident)
    return saida


def reutiliza(catalogo: dict[str, list[dict]], vellas: dict[str, str]) -> int:
    """Renomea o que xa está baixado en vez de volvelo pedir.

    Ao partir o canto e o reclamo en dúas prazas cambiaron todos os nomes de
    ficheiro: `merlo.opus` pasa a ser `merlo-canto.opus`. O audio, se a
    gravación escollida é a mesma, é byte a byte o de antes.
    """
    por_id = {ident: ruta for ruta, ident in vellas.items()}
    n = 0
    for clips in catalogo.values():
        for c in clips:
            destino = RAIZ / "public" / c["ficheiro"].removeprefix("/")
            if destino.exists():
                continue
            vella = por_id.get(c["id"])
            if not vella:
                continue
            orixe = RAIZ / "public" / vella.removeprefix("/")
            if not orixe.exists():
                continue
            destino.parent.mkdir(parents=True, exist_ok=True)
            orixe.replace(destino)
            n += 1
    return n


def limpa_orfas(catalogo: dict[str, list[dict]]) -> int:
    """Borra os .opus que xa non figuran no catálogo.

    Sen isto quedarían no repo os ficheiros co nome vello e mais os das
    gravacións que deixaron de estar escollidas: peso morto que se sube a git e
    que ademais se lle serve a quen descargue todo para uso sen conexión.
    """
    vivos = {(RAIZ / "public" / c["ficheiro"].removeprefix("/")).resolve()
             for clips in catalogo.values() for c in clips}
    n = 0
    for f in DIR_CANTOS.glob("*.opus"):
        if f.resolve() not in vivos:
            f.unlink()
            n += 1
    return n


def transcodifica(orixe: Path, destino: Path) -> bool:
    """Recorta e recodifica a Opus mono. Devolve False se ffmpeg falla."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run([
        FFMPEG, "-y", "-loglevel", "error",
        "-i", str(orixe),
        "-t", str(DURACION),
        "-ac", "1",
        "-c:a", "libopus", "-b:a", "24k",
        str(destino),
    ], capture_output=True, text=True)

    if proc.returncode != 0:
        log(f"    ffmpeg fallou: {proc.stderr.strip()[:120]}")
        return False
    return True


def main() -> None:
    so_meta = "--so-meta" in sys.argv

    clave = os.environ.get("XENOCANTO_API_KEY", "").strip()
    if not clave:
        raise SystemExit("Falta XENOCANTO_API_KEY no .env")

    if not so_meta and not shutil.which(FFMPEG):
        raise SystemExit(
            f"Non se atopa ffmpeg (buscouse '{FFMPEG}').\n"
            "  Instálao con:  winget install Gyan.FFmpeg\n"
            "  Se acabas de instalalo, reinicia a consola ou define\n"
            "  PAXARINAS_FFMPEG coa ruta completa ao executable.\n"
            "  Ou executa:    python etl/xenocanto_cantos.py --so-meta"
        )

    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    vellas = ids_anteriores()

    # As divagantes con catro citas non merecen unha petición: xeno-canto pide
    # moderación e o seu canto non lle interesa a ninguén nesta app.
    obxectivo = [e for e in especies if not e["rara"]]
    log(f"Buscando canto e reclamo de {len(obxectivo)} especies habituais "
        f"(exclúense {len(especies) - len(obxectivo)} raras)...\n")

    catalogo: dict[str, list[dict]] = {}
    por_ambito: dict[str, int] = {}
    por_praza: dict[str, int] = {}
    sen_nada = 0

    for i, e in enumerate(obxectivo, 1):
        sci = e["nomeCientifico"]
        s = slug(sci)
        collidas: set[str] = set()
        clips: list[dict] = []

        for praza, busca in PRAZAS:
            rec = busca_gravacion(sci, clave, busca, collidas)
            if not rec:
                continue
            collidas.add(str(rec.get("id")))
            clips.append({
                "praza": praza,
                "slug": s,
                "id": str(rec.get("id")),
                "ficheiro": f"/media/cantos/{s}-{praza}.opus",
                "autor": rec.get("rec"),
                # As dúas van a un `href` na ficha: só se publican se son http(s).
                "licenza": licenza_url(rec.get("lic")),
                "orixe": url_segura(rec.get("url")),
                "lugar": rec.get("loc"),
                "pais": rec.get("cnt"),
                "tipo": rec.get("type"),
                "ambito": rec["_ambito"],
                "_descarga": rec["file"],
            })
            por_ambito[rec["_ambito"]] = por_ambito.get(rec["_ambito"], 0) + 1
            por_praza[praza] = por_praza.get(praza, 0) + 1

        if clips:
            catalogo[sci] = clips
        else:
            sen_nada += 1

        if i % 25 == 0:
            log(f"  ... {i}/{len(obxectivo)} especies consultadas")

    total = sum(len(v) for v in catalogo.values())
    log(f"\nAtopadas {total} gravacións de {len(catalogo)} especies.")
    log("Por praza:")
    for praza, _ in PRAZAS:
        log(f"  {praza:22} {por_praza.get(praza, 0)}")
    log("Por ámbito:")
    for etiqueta, n in por_ambito.items():
        log(f"  {etiqueta:22} {n}")

    if so_meta:
        for clips in catalogo.values():
            for c in clips:
                c.pop("_descarga", None)
        destino = escribe_json("xenocanto_cantos.json", {
            "fonte": "xeno-canto",
            "total": total,
            "cantos": catalogo,
        })
        log(f"\nSó metadatos. Escrito en {destino}")
        return

    # Antes de baixar nada: as gravacións que xa temos e seguen escollidas só
    # cambian de nome. Son ~375 ficheiros idénticos e xeno-canto non ten por que
    # servilos dúas veces.
    renomeadas = reutiliza(catalogo, vellas)
    if renomeadas:
        log(f"\nReaproveitadas {renomeadas} gravacións que xa estaban baixadas.")

    log(f"\nDescargando e recodificando a Opus {DURACION}s mono...")
    DIR_TEMP.mkdir(parents=True, exist_ok=True)
    listos = 0
    fallidos: list[str] = []

    pendentes = [(sci, c) for sci, clips in sorted(catalogo.items()) for c in clips]
    for i, (sci, dados) in enumerate(pendentes, 1):
        final = RAIZ / "public" / dados["ficheiro"].removeprefix("/")
        if final.exists():
            listos += 1
            continue

        cru = DIR_TEMP / f"{dados['slug']}-{dados['praza']}.audio"
        try:
            descarga_ficheiro(dados["_descarga"], cru)
        except RuntimeError as err:
            fallidos.append(f"{sci} ({dados['praza']}): {err}")
            continue

        if transcodifica(cru, final):
            listos += 1
        else:
            fallidos.append(f"{sci} ({dados['praza']}): erro ao recodificar")
        cru.unlink(missing_ok=True)

        if i % 25 == 0:
            log(f"  ... {i}/{len(pendentes)}")

    # Só quedan no catálogo os clips que teñen ficheiro de verdade: se unha
    # descarga falla, o que non pode é figurar na ficha cun reprodutor roto.
    for sci in list(catalogo):
        vivos = []
        for c in catalogo[sci]:
            if (RAIZ / "public" / c["ficheiro"].removeprefix("/")).exists():
                c.pop("_descarga", None)
                vivos.append(c)
        if vivos:
            catalogo[sci] = vivos
        else:
            del catalogo[sci]

    orfas = limpa_orfas(catalogo)

    total = sum(len(v) for v in catalogo.values())
    destino = escribe_json("xenocanto_cantos.json", {
        "fonte": "xeno-canto",
        "total": total,
        "cantos": catalogo,
    })

    peso = sum(f.stat().st_size for f in DIR_CANTOS.glob("*.opus")) / 1024 / 1024
    con_canto = sum(1 for v in catalogo.values() if any(c["praza"] == "canto" for c in v))
    con_reclamo = sum(1 for v in catalogo.values() if any(c["praza"] == "reclamo" for c in v))

    log("")
    log(f"Especies con algunha gravación: {len(catalogo)} de {len(obxectivo)}")
    log(f"  con canto:    {con_canto}")
    log(f"  con reclamo:  {con_reclamo}")
    log(f"  coas dúas:    {con_canto + con_reclamo - len(catalogo)}")
    log(f"Sen ningunha gravación válida: {sen_nada}")
    log(f"Ficheiros: {total} · Peso total: {peso:.1f} MB")
    if orfas:
        log(f"Borradas {orfas} gravacións que xa non se usan.")
    if fallidos:
        log(f"\nFallos ({len(fallidos)}), reintentables:")
        for f in fallidos[:10]:
            log(f"  - {f}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
