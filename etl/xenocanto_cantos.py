"""Fonte xeno-canto: unha gravación do canto de cada especie.

Escóllese por proximidade xeográfica antes que por nada máis. Moitas especies
teñen subespecies con voces distintas — o paporrubio canario, sen ir máis
lonxe — así que unha gravación de Tenerife non serve para unha guía galega.
A busca vai en cascada: primeiro Galicia e o seu contorno, logo o cuadrante
noroeste ibérico, e só despois calquera lugar.

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
from pathlib import Path

from common import OUT_DIR, descarga_ficheiro, escribe_json, get_json, log, slug

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

# Segundos que se conservan de cada gravación. Abondan para recoñecer unha voz
# e manteñen o total nunhas decenas de MB en vez de centos.
DURACION = 15


def licenza_valida(url: str | None) -> bool:
    """Rexeita as licenzas sen obra derivada: imos recortar e recodificar."""
    if not url:
        return False
    return "creativecommons.org" in url and "-nd" not in url.lower()


def puntua(rec: dict) -> tuple:
    """Ordena as candidatas: primeiro cantos, logo calidade, logo duración."""
    tipo = (rec.get("type") or "").lower()
    e_canto = "song" in tipo
    calidade = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}.get(rec.get("q", "E"), 5)

    # Preferimos gravacións curtas: menos ruído de fondo e menos que descargar.
    try:
        m, s = (rec.get("length") or "0:00").split(":")
        segundos = int(m) * 60 + int(s)
    except ValueError:
        segundos = 999

    return (not e_canto, calidade, abs(segundos - 30))


def busca_gravacion(cientifico: str, clave: str) -> dict | None:
    for etiqueta, ambito in AMBITOS:
        consulta = f'sp:"{cientifico}" q:A {ambito}'.strip()
        data = get_json(API, {"query": consulta, "key": clave})

        candidatas = [r for r in data.get("recordings", [])
                      if licenza_valida(r.get("lic")) and r.get("file")]
        if not candidatas:
            continue

        mellor = sorted(candidatas, key=puntua)[0]
        mellor["_ambito"] = etiqueta
        return mellor

    return None


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

    # As divagantes con catro citas non merecen unha petición: xeno-canto pide
    # moderación e o seu canto non lle interesa a ninguén nesta app.
    obxectivo = [e for e in especies if not e["rara"]]
    log(f"Buscando cantos de {len(obxectivo)} especies habituais "
        f"(exclúense {len(especies) - len(obxectivo)} raras)...\n")

    catalogo: dict[str, dict] = {}
    por_ambito: dict[str, int] = {}
    sen_canto = 0

    for i, e in enumerate(obxectivo, 1):
        sci = e["nomeCientifico"]
        rec = busca_gravacion(sci, clave)
        if not rec:
            sen_canto += 1
            continue

        s = slug(sci)
        catalogo[sci] = {
            "slug": s,
            "ficheiro": f"/media/cantos/{s}.opus",
            "autor": rec.get("rec"),
            "licenza": rec.get("lic"),
            "orixe": rec.get("url"),
            "lugar": rec.get("loc"),
            "pais": rec.get("cnt"),
            "tipo": rec.get("type"),
            "ambito": rec["_ambito"],
            "_descarga": rec["file"],
        }
        por_ambito[rec["_ambito"]] = por_ambito.get(rec["_ambito"], 0) + 1

        if i % 25 == 0:
            log(f"  ... {i}/{len(obxectivo)} especies consultadas")

    log(f"\nAtopadas {len(catalogo)} gravacións. Por ámbito:")
    for etiqueta, n in por_ambito.items():
        log(f"  {etiqueta:22} {n}")

    if so_meta:
        for dados in catalogo.values():
            dados.pop("_descarga", None)
        destino = escribe_json("xenocanto_cantos.json", {
            "fonte": "xeno-canto",
            "total": len(catalogo),
            "cantos": catalogo,
        })
        log(f"\nSó metadatos. Escrito en {destino}")
        return

    log(f"\nDescargando e recodificando a Opus {DURACION}s mono...")
    DIR_TEMP.mkdir(parents=True, exist_ok=True)
    listos = 0
    fallidos: list[str] = []

    for i, (sci, dados) in enumerate(sorted(catalogo.items()), 1):
        final = RAIZ / "public" / dados["ficheiro"].removeprefix("/")
        if final.exists():
            listos += 1
            continue

        cru = DIR_TEMP / f"{dados['slug']}.audio"
        try:
            descarga_ficheiro(dados["_descarga"], cru)
        except RuntimeError as err:
            fallidos.append(f"{sci}: {err}")
            continue

        if transcodifica(cru, final):
            listos += 1
        else:
            fallidos.append(f"{sci}: erro ao recodificar")
        cru.unlink(missing_ok=True)

        if i % 25 == 0:
            log(f"  ... {i}/{len(catalogo)}")

    # Só quedan no catálogo as que teñen ficheiro de verdade.
    for sci in list(catalogo):
        ruta = RAIZ / "public" / catalogo[sci]["ficheiro"].removeprefix("/")
        if not ruta.exists():
            del catalogo[sci]
        else:
            catalogo[sci].pop("_descarga", None)

    destino = escribe_json("xenocanto_cantos.json", {
        "fonte": "xeno-canto",
        "total": len(catalogo),
        "cantos": catalogo,
    })

    peso = sum(f.stat().st_size for f in DIR_CANTOS.glob("*.opus")) / 1024 / 1024

    log("")
    log(f"Especies con canto: {len(catalogo)} de {len(obxectivo)}")
    log(f"Sen gravación válida: {sen_canto}")
    log(f"Peso total: {peso:.1f} MB")
    if fallidos:
        log(f"\nFallos ({len(fallidos)}), reintentables:")
        for f in fallidos[:10]:
            log(f"  - {f}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
