"""Fonte Commons: unhas cantas fotos máis por especie, para ver só con conexión.

A diferenza da foto principal, estas non se descargan: gárdanse os metadatos
(URL, autoría, licenza) e a imaxe pídeselle a Commons no momento. Por iso a
galería desaparece sen cobertura, mentres que a foto principal segue aí.

Wikimedia di que enlazar directamente ás súas imaxes "é posible, pero non está
recomendado", e que as obrigas da licenza seguen intactas. De aí dúas decisións:
a galería cárgase ao premer e non soa, e cada foto leva a súa autoría visible.

Escríbese un ficheiro por especie para que a ficha só baixe o seu, e para que
nada disto engorde o catálogo nin o precache.

Uso:
    python etl/commons_galeria.py

Saída:
    public/data/galeria/<slug>.json
    etl/out/commons_galeria.json   (resumo)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from common import OUT_DIR, escribe_json, get_json, log, slug
from wikimedia_fotos import sen_html

RAIZ = Path(__file__).resolve().parent.parent
DIR_GALERIA = RAIZ / "public" / "data" / "galeria"

COMMONS = "https://commons.wikimedia.org/w/api.php"

POR_ESPECIE = 20

# Dous tamaños: a miniatura da grella e a que se ve ao ampliar. Wikimedia só
# serve unha lista pechada de anchos, e 330 e 960 están nela.
ANCHO_GRELLA = 330
ANCHO_GRANDE = 960

# As categorías de taxons tamén conteñen mapas de distribución, ilustracións
# antigas, ovos, esqueletos e sonogramas. Non son o que busca alguén que quere
# ver como é o paxaro.
FÓRA = re.compile(
    r"\b(map|distribution|range|verbreitung|areal|egg|eggs|nest|skeleton|skull|"
    r"bone|specimen|illustration|drawing|plate|lithograph|stamp|sonogram|"
    r"spectrogram|diagram|chart|logo|sign)\b",
    re.IGNORECASE,
)


def licenza_ok(meta: dict) -> bool:
    url = (meta.get("LicenseUrl", {}).get("value") or "")
    curta = (meta.get("LicenseShortName", {}).get("value") or "")
    return "creativecommons" in url or "public domain" in curta.lower() or "CC0" in curta


def fotos_de(sci: str, ancho: int) -> list[dict]:
    data = get_json(COMMONS, {
        "action": "query", "format": "json",
        "generator": "categorymembers",
        "gcmtitle": f"Category:{sci}",
        "gcmtype": "file",
        "gcmlimit": 50,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime",
        "iiurlwidth": ancho,
    })

    candidatas = []
    for paxina in data.get("query", {}).get("pages", {}).values():
        info = (paxina.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        titulo = paxina.get("title", "").removeprefix("File:")

        if not info.get("thumburl"):
            continue
        if not (info.get("mime") or "").startswith("image/"):
            continue
        if FÓRA.search(titulo):
            continue
        if not licenza_ok(meta):
            continue

        def campo(clave: str) -> str | None:
            valor = meta.get(clave, {}).get("value")
            return sen_html(valor) if valor else None

        candidatas.append({
            "ficheiro": titulo,
            # Sen os parámetros de seguimento que engade a API.
            "url": info["thumburl"].split("?")[0],
            "autor": campo("Artist"),
            "licenza": campo("LicenseShortName"),
            "licenzaUrl": meta.get("LicenseUrl", {}).get("value"),
            "orixe": info.get("descriptionurl"),
        })

    return candidatas


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]

    # A foto principal xa se ve na ficha: non se repite na galería.
    principais = {}
    ficheiro_fotos = OUT_DIR / "wikimedia_fotos.json"
    if ficheiro_fotos.exists():
        principais = {sci: d["ficheiro"] for sci, d
                      in json.loads(ficheiro_fotos.read_text(encoding="utf-8"))["fotos"].items()}

    DIR_GALERIA.mkdir(parents=True, exist_ok=True)
    log(f"Buscando ata {POR_ESPECIE} fotos de {len(especies)} especies...\n")

    resumo: dict[str, int] = {}
    sen_ningunha = []

    for i, e in enumerate(especies, 1):
        sci = e["nomeCientifico"]
        candidatas = fotos_de(sci, ANCHO_GRELLA)

        principal = principais.get(sci)
        escollidas = [c for c in candidatas if c["ficheiro"] != principal][:POR_ESPECIE]

        # Só se piden as grandes das que quedaron: pedir as 50 sería tres veces
        # máis tráfico contra Wikimedia para tirar dous tercios.
        if escollidas:
            grandes = {g["ficheiro"]: g["url"]
                       for g in fotos_de(sci, ANCHO_GRANDE)}
            for c in escollidas:
                # Se a orixinal é máis pequena ca 960 px, Commons non a amplía e
                # devolve o que ten: nese caso vale a mesma da grella.
                c["urlGrande"] = grandes.get(c["ficheiro"], c["url"])

        if not escollidas:
            sen_ningunha.append(sci)
            continue

        s = slug(sci)
        (DIR_GALERIA / f"{s}.json").write_text(
            json.dumps({
                "cientifico": sci,
                "fonte": "Wikimedia Commons",
                "fotos": escollidas,
            }, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        resumo[s] = len(escollidas)

        if i % 50 == 0:
            log(f"  ... {i}/{len(especies)}")

    destino = escribe_json("commons_galeria.json", {
        "fonte": "Wikimedia Commons (categorías de taxon)",
        "porEspecie": POR_ESPECIE,
        "anchoGrella": ANCHO_GRELLA,
        "anchoGrande": ANCHO_GRANDE,
        "conGaleria": len(resumo),
        "senNingunha": sen_ningunha,
    })

    peso = sum(f.stat().st_size for f in DIR_GALERIA.glob("*.json")) / 1024
    media = sum(resumo.values()) / len(resumo) if resumo else 0

    log("")
    log(f"Especies con galería: {len(resumo)} de {len(especies)}")
    log(f"  fotos de media:     {media:.1f}")
    log(f"  sen ningunha:       {len(sen_ningunha)}")
    log(f"Peso dos metadatos:   {peso:.0f} kB en {len(resumo)} ficheiros")
    log(f"\nEscrito en {DIR_GALERIA.relative_to(RAIZ)} e {destino}")


if __name__ == "__main__":
    main()
