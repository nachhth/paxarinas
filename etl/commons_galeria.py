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

from common import (OUT_DIR, categoria_alternativa, categorias_de,
                    escribe_json, foto_admisible, get_json, log, sen_html,
                    slug, subcategorias, url_segura)

RAIZ = Path(__file__).resolve().parent.parent
DIR_GALERIA = RAIZ / "public" / "data" / "galeria"

COMMONS = "https://commons.wikimedia.org/w/api.php"

POR_ESPECIE = 20

# Canto se afonda cando a categoría da especie non dá abondo. Commons arquiva
# as especies moi fotografadas en subcategorías («in flight», «by country») e
# deixa na de arriba catro ficheiros soltos: sen mirar dentro, a carriza e o
# ferreiriño rabilongo quedaban sen galería. Seis é o que fai falla para xuntar
# vinte fotos nas que se probaron, e pon un teito ao número de peticións.
MAX_SUBCATS = 6

# Dous tamaños: a miniatura da grella e a que se ve ao ampliar. Wikimedia só
# serve unha lista pechada de anchos, e 330 e 960 están nela.
ANCHO_GRELLA = 330
ANCHO_GRANDE = 960

# Os filtros do que non é unha foto do paxaro viven en `common.py`: compárteos
# coa foto principal, porque o erro é o mesmo nas dúas.


def fotos_de(categoria: str, ancho: int) -> list[dict]:
    """As fotos utilizables que hai DENTRO dunha categoría de Commons."""
    data = get_json(COMMONS, {
        "action": "query", "format": "json",
        "generator": "categorymembers",
        "gcmtitle": categoria,
        "gcmtype": "file",
        "gcmlimit": 50,
        # As categorías veñen na mesma petición: filtrar por elas non custa
        # ningunha chamada extra.
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime",
        "iiurlwidth": ancho,
    })

    paxinas = list(data.get("query", {}).get("pages", {}).values())
    # As categorías, nunha petición aparte: ver `categorias_de`.
    cats_de = categorias_de([p.get("title", "") for p in paxinas])

    candidatas = []
    for paxina in paxinas:
        info = (paxina.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        titulo = paxina.get("title", "").removeprefix("File:")

        if not info.get("thumburl"):
            continue
        if not (info.get("mime") or "").startswith("image/"):
            continue

        categorias = cats_de.get(paxina.get("title", ""), "")
        if not foto_admisible(titulo, categorias, meta):
            continue

        def campo(clave: str) -> str | None:
            valor = meta.get(clave, {}).get("value")
            return sen_html(valor) if valor else None

        # A miniatura non se pode publicar se non é http(s): sería unha imaxe
        # que non carga, ou pior.
        miniatura = url_segura(info["thumburl"].split("?")[0])
        if not miniatura:
            continue

        candidatas.append({
            "ficheiro": titulo,
            # Sen os parámetros de seguimento que engade a API.
            "url": miniatura,
            "autor": campo("Artist"),
            "licenza": campo("LicenseShortName"),
            # `LicenseUrl` e mais a páxina de orixe van a un `href`: só http(s).
            "licenzaUrl": url_segura(meta.get("LicenseUrl", {}).get("value")),
            "orixe": url_segura(info.get("descriptionurl")),
        })

    return candidatas


def fotos_da_especie(sci: str, familia: str | None = None,
                     xenero: str | None = None) -> tuple[list[dict], list[str]]:
    """Fotos da especie e as categorías de onde saíron, por esta orde:

      1. a categoría co seu nome científico;
      2. as subcategorías dela, se non chegan (`MAX_SUBCATS`);
      3. a categoría co nome que Commons use agora, se non hai ningunha.

    Devólvense tamén as categorías usadas, que non é un detalle: serven para
    dicir no resumo por que unha especie non ten galería.
    """
    usadas: list[str] = []
    fotos: list[dict] = []
    vistos: set[str] = set()

    def engade(categoria: str) -> None:
        usadas.append(categoria)
        for c in fotos_de(categoria, ANCHO_GRELLA):
            if c["ficheiro"] not in vistos:
                vistos.add(c["ficheiro"])
                fotos.append(c)

    def busca_en(raiz: str) -> None:
        engade(raiz)
        if len(fotos) >= POR_ESPECIE:
            return
        for sub in subcategorias(raiz)[:MAX_SUBCATS]:
            engade(sub)
            if len(fotos) >= POR_ESPECIE:
                return

    busca_en(f"Category:{sci}")

    if not fotos:
        outra = categoria_alternativa(sci, familia, xenero)
        if outra:
            busca_en(outra)

    return fotos, usadas


def amplia(ficheiros: list[str], ancho: int) -> dict[str, str]:
    """A URL de cada foto ao tamaño grande, nunha soa petición.

    Antes pedíase outra vez a categoría enteira co ancho grande. Preguntando
    polos ficheiros concretos dá igual en que categoría estean —agora poden
    vir de varias— e son 50 nunha chamada en vez dunha chamada por categoría.
    """
    if not ficheiros:
        return {}
    data = get_json(COMMONS, {
        "action": "query", "format": "json",
        "titles": "|".join(f"File:{f}" for f in ficheiros[:50]),
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": ancho,
    })
    grandes = {}
    for paxina in data.get("query", {}).get("pages", {}).values():
        info = (paxina.get("imageinfo") or [{}])[0]
        if info.get("thumburl"):
            titulo = paxina.get("title", "").removeprefix("File:")
            grandes[titulo] = info["thumburl"].split("?")[0]
    return grandes


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
        candidatas, categorias = fotos_da_especie(
            sci, e.get("familia"), e.get("xenero"))

        principal = principais.get(sci)
        escollidas = [c for c in candidatas if c["ficheiro"] != principal][:POR_ESPECIE]

        # Só se piden as grandes das que quedaron: pedir as 50 sería tres veces
        # máis tráfico contra Wikimedia para tirar dous tercios.
        if escollidas:
            grandes = amplia([c["ficheiro"] for c in escollidas], ANCHO_GRANDE)
            for c in escollidas:
                # Se a orixinal é máis pequena ca 960 px, Commons non a amplía e
                # devolve o que ten: nese caso vale a mesma da grella.
                c["urlGrande"] = url_segura(grandes.get(c["ficheiro"])) or c["url"]

        if not escollidas:
            # Anótase en que categorías se buscou: sen iso, unha especie sen
            # galería non se distingue dun erro noso.
            sen_ningunha.append({"especie": sci, "probadas": categorias})
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
