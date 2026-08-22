"""Fonte Wikimedia: unha foto por especie, coa súa autoría e licenza.

Dous pasos:
  1. Wikidata (SPARQL) di cal é a imaxe principal (P18) do taxon cuxo nome
     científico (P225) coincide co noso.
  2. A API de Commons dá, para ese ficheiro, o autor, a licenza e as miniaturas
     xa redimensionadas polos seus servidores.

As imaxes descárganse en dous tamaños. A pequena vai no listado e precacheáse
enteira; a grande vai na ficha e cachéase baixo demanda, porque 517 imaxes
grandes non caben nun service worker.

Uso:
    python etl/wikimedia_fotos.py

Saída:
    etl/out/wikimedia_fotos.json   (metadatos, versionado)
    public/media/fotos/*.jpg       (binarios, fóra do repositorio)
"""

from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path

from common import (OUT_DIR, categoria_alternativa, categorias_de,
                    descarga_ficheiro, escribe_json, foto_admisible, get_json,
                    log, sen_html, slug, url_segura)

RAIZ = Path(__file__).resolve().parent.parent
DIR_FOTOS = RAIZ / "public" / "media" / "fotos"

SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"

# Wikimedia só serve unha lista pechada de anchos (20, 40, 60, 120, 250, 330,
# 500, 960, 1280...) e rexeita calquera outro. Pedir 640 devolvería 960.
# https://www.mediawiki.org/wiki/Common_thumbnail_sizes
ANCHO_GRANDE = 500
ANCHO_MINI = 250

# Límites das APIs: SPARQL admite consultas longas pero convén non abusar;
# a API de Commons acepta 50 títulos por petición.
LOTE_SPARQL = 100
LOTE_COMMONS = 50


# Títulos que anuncian un bando en vez dun paxaro. Non se descartan: van ao
# final da cola, porque nalgunhas especies pelágicas é o único que hai.
BANDO = re.compile(r"\b(many|flock|flocks|group|groups|colony|colonies|raft|"
                   r"bando|bandada|colonia)\b", re.IGNORECASE)

# Fotos que non valen aínda que pasen todos os filtros. Non hai xeito de que un
# programa decida isto: son fotos legais, do bicho certo e ben etiquetadas, pero
# non se ve o paxaro. Van a man, cada unha co seu motivo.
FOTOS_VETADAS = {
    # Un bando ao lonxe nun lago: non se distingue a galiñola de ningunha outra.
    "Birds at Lake Naivasha (300261994).jpg",
    # Cisne negro a contraluz e cortado.
    "2023-04-17-black-swan1.jpg",
    # Un bando no mar ao lonxe, e ademais con dúas especies mesturadas: nunha
    # guía para recoñecer aves iso non serve de nada.
    "Puffinus gravis and Puffinus griseus.jpg",
}


def imaxe_de_calidade(sci: str) -> str | None:
    """Unha foto da especie co distintivo de calidade de Commons, se a hai.

    Commons ten unha revisión entre pares: as fotos que pasan quedan marcadas
    como «Quality images». É o único xuízo de calidade que hai, e está feito por
    xente mirando as fotos, así que vale máis ca calquera regra que se poida
    escribir aquí. Cando existe, gaña á imaxe que apunta Wikidata, que ninguén
    escolleu pensando en como se ve nunha ficha.

    Búscase coa procura de Commons e non pedindo a categoría enteira: os
    distintivos non están no ficheiro senón nunha categoría aparte, e cruzalas
    é o que fai `incategory`.
    """
    data = get_json(COMMONS, {
        "action": "query", "format": "json",
        "list": "search",
        "srsearch": f'incategory:"{sci}" incategory:"Quality images"',
        "srnamespace": 6,   # File:
        "srlimit": 5,
    })
    for r in data.get("query", {}).get("search", []):
        nome = r["title"].removeprefix("File:")
        if nome not in FOTOS_VETADAS:
            return nome
    return None


def candidatas_da_categoria(sci: str, ancho: int, categoria: str | None = None) -> list[dict]:
    """Fotos válidas da categoría da especie, por se P18 non serve.

    Wikidata apunta a unha soa imaxe por taxon e ninguén garante que sexa unha
    foto: no asubiador era un selo de correos de 1994. Cando pasa iso hai que
    ir buscar á categoría, que é de onde xa sae a galería.

    `categoria` permite mirar noutra distinta da que leva o nome científico:
    fai falta para as especies que Commons ten baixo o nome novo (ver
    `categoria_alternativa`).
    """
    data = get_json(COMMONS, {
        "action": "query", "format": "json",
        "generator": "categorymembers",
        "gcmtitle": categoria or f"Category:{sci}",
        "gcmtype": "file",
        "gcmlimit": 50,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime|size",
        "iiurlwidth": ancho,
    })

    paxinas = list(data.get("query", {}).get("pages", {}).values())
    # As categorías van nunha petición aparte: ver `categorias_de`.
    cats_de = categorias_de([p.get("title", "") for p in paxinas])

    válidas = []
    for paxina in paxinas:
        info = (paxina.get("imageinfo") or [{}])[0]
        if not info.get("thumburl") or not (info.get("mime") or "").startswith("image/"):
            continue
        titulo = paxina.get("title", "").removeprefix("File:")
        cats = cats_de.get(paxina.get("title", ""), "")
        if titulo in FOTOS_VETADAS:
            continue
        if not foto_admisible(titulo, cats, info.get("extmetadata", {})):
            continue
        válidas.append((titulo, info))

    # Primeiro as que levan o nome da especie no título, e despois alfabético.
    #
    # Que alguén lle poña «Crested Coot (Fulica cristata)» a unha foto quere
    # dicir que sabía o que estaba a retratar; «Coot (7513879428).jpg» é o nome
    # que deixa unha importación automática, e pode ser calquera cousa que
    # pasase por diante. Dentro de cada grupo mándase alfabeticamente, que é
    # como as devolve Commons e o único estable entre execucións.
    partes = sci.lower().split()
    xenero, epiteto = partes[0], partes[-1]

    def orde(par):
        t = par[0].lower()
        if sci.lower() in t or epiteto in t:
            posto = 0        # «Crested Coot (Fulica cristata) (1).jpg»
        elif xenero in t:
            posto = 1        # «Columba livia in Barcelona.jpg»
        else:
            posto = 2        # «500px photo (155156461).jpeg», que non di nada
        # E ao final as de bandos. Nunha guía para recoñecer aves, un paxaro
        # grande e enteiro vale máis ca trinta ao lonxe: a pardela sombría
        # quedaba cunha balsa de aves no mar tendo na mesma categoría un
        # primeiro plano da cabeza.
        bando = 1 if BANDO.search(t) else 0
        return (posto, bando, par[0])

    válidas.sort(key=orde)
    return [{"ficheiro": t, "info": i} for t, i in válidas]


def extension(ficheiro: str) -> str:
    """A miniatura conserva o formato da orixe, agás os SVG, que saen en PNG."""
    ext = Path(ficheiro).suffix.lower()
    return ".png" if ext == ".svg" else (ext or ".jpg")


def lotes(seq: list, tamano: int):
    for i in range(0, len(seq), tamano):
        yield seq[i:i + tamano]


def imaxes_wikidata(nomes: list[str]) -> dict[str, str]:
    """nome científico -> nome do ficheiro en Commons."""
    atopadas: dict[str, str] = {}

    for i, lote in enumerate(lotes(nomes, LOTE_SPARQL), 1):
        valores = " ".join(f'"{n}"' for n in lote)
        consulta = f"""
            SELECT ?nome ?imaxe WHERE {{
              VALUES ?nome {{ {valores} }}
              ?taxon wdt:P225 ?nome ; wdt:P18 ?imaxe .
            }}
        """
        data = get_json(SPARQL, {"query": consulta, "format": "json"})

        for fila in data["results"]["bindings"]:
            nome = fila["nome"]["value"]
            if nome in atopadas:
                continue  # varias imaxes por taxon: quedamos coa primeira
            url = fila["imaxe"]["value"]
            # .../Special:FilePath/Erithacus%20rubecula.jpg
            ficheiro = urllib.parse.unquote(url.rsplit("/", 1)[-1])
            atopadas[nome] = ficheiro

        log(f"  ... lote {i}: {len(atopadas)} imaxes localizadas")

    return atopadas


def detalles_commons(ficheiros: list[str], ancho: int) -> dict[str, dict]:
    """nome do ficheiro -> {thumb, autor, licenza, licenzaUrl, descricionUrl}."""
    detalles: dict[str, dict] = {}

    for lote in lotes(ficheiros, LOTE_COMMONS):
        data = get_json(COMMONS, {
            "action": "query",
            "format": "json",
            "titles": "|".join(f"File:{f}" for f in lote),
            "prop": "imageinfo",
            # `size` dá as medidas reais da miniatura: fan falta para amosar a
            # foto principal coa súa proporción en vez de recortala.
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": ancho,
        })

        paxinas = list(data.get("query", {}).get("pages", {}).values())
        cats_de = categorias_de([p["title"] for p in paxinas])

        for paxina in paxinas:
            info = (paxina.get("imageinfo") or [{}])[0]
            if not info.get("thumburl"):
                continue

            meta = info.get("extmetadata", {})
            titulo_cru = paxina["title"].removeprefix("File:")
            cats = cats_de.get(paxina["title"], "")
            # Non abonda con que exista: ten que ser unha foto do paxaro.
            if not foto_admisible(titulo_cru, cats, meta):
                continue

            def campo(clave: str) -> str | None:
                valor = meta.get(clave, {}).get("value")
                return sen_html(valor) if valor else None

            titulo = paxina["title"].removeprefix("File:")
            detalles[titulo] = {
                "thumb": info["thumburl"],
                "ancho": info.get("thumbwidth"),
                "alto": info.get("thumbheight"),
                "autor": campo("Artist"),
                "licenza": campo("LicenseShortName"),
                "licenzaUrl": meta.get("LicenseUrl", {}).get("value"),
                "descricionUrl": info.get("descriptionurl"),
            }

    return detalles


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    nomes = sorted({e["nomeCientifico"] for e in especies if e.get("nomeCientifico")})
    log(f"{len(nomes)} especies. Consultando Wikidata...")

    por_nome = imaxes_wikidata(nomes)
    log(f"\nWikidata ten imaxe para {len(por_nome)} de {len(nomes)} especies.\n")

    ficheiros = sorted(set(por_nome.values()))
    log("Consultando autoría e licenzas en Commons...")
    grandes = detalles_commons(ficheiros, ANCHO_GRANDE)
    minis = detalles_commons(ficheiros, ANCHO_MINI)
    log(f"Commons devolve datos de {len(grandes)} ficheiros.\n")

    # Que ficheiro de orixe tiña cada especie na execución anterior. Serve para
    # detectar que a foto cambiou aínda que o nome local sexa o mesmo.
    anterior: dict[str, str] = {}
    previo = OUT_DIR / "wikimedia_fotos.json"
    if previo.exists():
        anterior = {sci: d.get("ficheiro") for sci, d
                    in json.loads(previo.read_text(encoding="utf-8"))["fotos"].items()}

    familias = {e["nomeCientifico"]: e.get("familia") for e in especies}
    xeneros = {e["nomeCientifico"]: e.get("xenero") for e in especies}
    # Especies ás que houbo que buscarlles a categoría por outro nome.
    categorias_outras: dict[str, str] = {}

    catalogo: dict[str, dict] = {}
    sen_licenza = 0
    rescatadas = 0
    cambiada: set[str] = set()

    # Tamén se busca alternativa para as que Wikidata nin sequera coñecía.
    for nome in sorted(set(nomes)):
        ficheiro = por_nome.get(nome)
        if ficheiro in FOTOS_VETADAS:
            ficheiro = None
        info = grandes.get(ficheiro) if ficheiro else None
        mini = minis.get(ficheiro) if ficheiro else None

        # A imaxe de Wikidata non serve (é un selo, un exemplar de museo, unha
        # ilustración, ou está vetada a man) ou non existe. Búscase unha foto de
        # verdade, por esta orde:
        #
        #   1. unha que teña o distintivo de calidade de Commons, que é xente
        #      revisando fotos e non unha regra nosa;
        #   2. a categoría da especie;
        #   3. a categoría co nome que Commons use agora, para as especies que
        #      cambiaron de xénero e teñen a súa baleira.
        if not info or not mini:
            de_calidade = imaxe_de_calidade(nome)
            if de_calidade:
                # Pídese o ficheiro polo seu nome e non pola categoría da
                # especie: as fotos con distintivo adoitan estar arquivadas nunha
                # subcategoría, e alí non as vería `candidatas_da_categoria`.
                grande_cal = detalles_commons([de_calidade], ANCHO_GRANDE)
                mini_cal = detalles_commons([de_calidade], ANCHO_MINI)
                if de_calidade in grande_cal and de_calidade in mini_cal:
                    ficheiro = de_calidade
                    info = grande_cal[de_calidade]
                    mini = mini_cal[de_calidade]
                    rescatadas += 1
                    cambiada.add(nome)

        if not info or not mini:
            alternativas = candidatas_da_categoria(nome, ANCHO_GRANDE)
            if not alternativas:
                outra = categoria_alternativa(nome, familias.get(nome), xeneros.get(nome))
                if outra:
                    alternativas = candidatas_da_categoria(nome, ANCHO_GRANDE, outra)
                    categorias_outras[nome] = outra
            if not alternativas:
                continue
            escollida = alternativas[0]
            ficheiro = escollida["ficheiro"]
            cru = escollida["info"]
            mini_cru = next((c["info"] for c in
                             candidatas_da_categoria(nome, ANCHO_MINI,
                                                     categorias_outras.get(nome))
                             if c["ficheiro"] == ficheiro), None)
            if not mini_cru:
                continue

            def campo(m, clave):
                v = m.get(clave, {}).get("value")
                return sen_html(v) if v else None

            meta = cru.get("extmetadata", {})
            info = {
                "thumb": cru["thumburl"],
                "ancho": cru.get("thumbwidth"), "alto": cru.get("thumbheight"),
                "autor": campo(meta, "Artist"),
                "licenza": campo(meta, "LicenseShortName"),
                "licenzaUrl": meta.get("LicenseUrl", {}).get("value"),
                "descricionUrl": cru.get("descriptionurl"),
            }
            mini = {"thumb": mini_cru["thumburl"]}
            rescatadas += 1
            # O nome local sae do slug da especie, non do ficheiro de orixe.
            # Se a foto cambiou, o ficheiro que hai no disco é o vello, e
            # `descarga_ficheiro` saltaríao por existir: hai que borralo.
            cambiada.add(nome)

        # Sen constancia da licenza non se usa a imaxe. Cortar por aquí é máis
        # barato que descubrir despois que non se pode redistribuír.
        if not info["licenza"]:
            sen_licenza += 1
            continue

        # Cambiou a foto de orixe respecto da última execución? Entón o que hai
        # no disco baixo o nome desta especie xa non lle corresponde.
        if nome in anterior and anterior[nome] != ficheiro:
            cambiada.add(nome)

        s = slug(nome)
        catalogo[nome] = {
            "slug": s,
            "ficheiro": ficheiro,
            "autor": info["autor"],
            "licenza": info["licenza"],
            # As dúas van a un `href` na ficha e veñen de `extmetadata`, que sae
            # do wikitexto que edita calquera: só se publican se son http(s).
            "licenzaUrl": url_segura(info["licenzaUrl"]),
            "orixe": url_segura(info["descricionUrl"]),
            "grande": f"/media/fotos/{s}-{ANCHO_GRANDE}{extension(ficheiro)}",
            "mini": f"/media/fotos/{s}-{ANCHO_MINI}{extension(ficheiro)}",
            # Medidas reais da grande: permiten reservarlle o oco exacto e
            # amosala enteira, sen recortar e sen que salte a páxina.
            "anchoGrande": info.get("ancho"),
            "altoGrande": info.get("alto"),
            "_urlGrande": info["thumb"],
            "_urlMini": mini["thumb"],
        }

    log(f"Descargando {len(catalogo) * 2} imaxes a {DIR_FOTOS.relative_to(RAIZ)}...")
    baixadas = 0
    fallidas: list[str] = []

    if cambiada:
        log(f"  ({len(cambiada)} especies cambiaron de foto: bórrase a vella)")

    for i, (nome, dados) in enumerate(sorted(catalogo.items()), 1):
        for chave, ruta in (("_urlGrande", "grande"), ("_urlMini", "mini")):
            destino = RAIZ / "public" / dados[ruta].removeprefix("/")
            if nome in cambiada:
                destino.unlink(missing_ok=True)
            try:
                if descarga_ficheiro(dados[chave], destino):
                    baixadas += 1
            except RuntimeError as err:
                # Unha imaxe caída non pode tumbar mil descargas. Anótase e
                # segue; a seguinte execución reintentaraa, porque só se
                # saltan os ficheiros que xa existen.
                fallidas.append(f"{nome}: {err}")
        if i % 50 == 0:
            log(f"  ... {i}/{len(catalogo)} especies")

    # As especies cuxas imaxes non se puideron baixar quedan fóra do catálogo,
    # para que a app nunca apunte a un ficheiro inexistente.
    for entrada in list(catalogo):
        dados = catalogo[entrada]
        rutas = (RAIZ / "public" / dados[r].removeprefix("/") for r in ("grande", "mini"))
        if not all(p.exists() for p in rutas):
            del catalogo[entrada]

    # As URL de orixe non fan falta na app: só serviron para descargar.
    for dados in catalogo.values():
        dados.pop("_urlGrande", None)
        dados.pop("_urlMini", None)

    destino = escribe_json("wikimedia_fotos.json", {
        "fonte": "Wikidata (P18) + Wikimedia Commons",
        "total": len(catalogo),
        "fotos": catalogo,
    })

    peso = sum(f.stat().st_size for f in DIR_FOTOS.glob("*.*")) / 1024 / 1024

    log("")
    log(f"Especies con foto:    {len(catalogo)} de {len(nomes)}")
    log(f"  buscadas na categoría porque a de Wikidata non servía "
        f"ou non existía: {rescatadas}")
    log(f"Descartadas sen licenza: {sen_licenza}")
    log(f"Imaxes novas baixadas: {baixadas}")
    log(f"Peso total en disco:  {peso:.1f} MB")
    if fallidas:
        log(f"\nDescargas fallidas ({len(fallidas)}), reintentables noutra execución:")
        for f in fallidas[:10]:
            log(f"  - {f}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
