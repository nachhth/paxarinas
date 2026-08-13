"""Fonte Wikipedia: un parágrafo que conte que é cada paxaro.

O catálogo ten peso, meses, mapa e canto, pero nin unha liña que che diga que
é o bicho que estás a mirar. Isto énchea.

Wikipedia en galego primeiro; onde non hai artigo, en castelán. As dúas versións
son CC BY-SA, así que hai que citar a fonte e ligar ao artigo, e faise en cada
ficha.

Os artigos localízanse polos sitelinks de Wikidata e non buscando polo nome: a
busca por texto devolve xéneros, familias e homónimos, e un parágrafo que fala
doutra especie é peor que non ter parágrafo.

Uso:
    python etl/wikipedia_textos.py

Saída:
    etl/out/wikipedia_textos.json
"""

from __future__ import annotations

import json
import re

from common import OUT_DIR, escribe_json, get_json, log

SPARQL = "https://query.wikidata.org/sparql"
LOTE = 80

# Máis alá disto xa non é unha presentación, é o artigo enteiro.
MAX_CARACTERES = 600

# Un parágrafo de dúas liñas non conta nada: mellor deixar o oco.
MIN_CARACTERES = 80

IDIOMAS = [
    ("gl", "glwiki", "https://gl.wikipedia.org"),
    ("es", "eswiki", "https://es.wikipedia.org"),
]


def lotes(seq: list, tamano: int):
    for i in range(0, len(seq), tamano):
        yield seq[i:i + tamano]


def artigos(nomes: list[str]) -> dict[str, dict[str, str]]:
    """nome científico -> {gl: título, es: título}, os que existan."""
    atopados: dict[str, dict[str, str]] = {}

    for i, lote in enumerate(lotes(nomes, LOTE), 1):
        valores = " ".join(f'"{n}"' for n in lote)
        consulta = f"""
            SELECT ?nome ?tituloGl ?tituloEs WHERE {{
              VALUES ?nome {{ {valores} }}
              ?taxon wdt:P225 ?nome .
              OPTIONAL {{
                ?artigoGl schema:about ?taxon ;
                          schema:isPartOf <https://gl.wikipedia.org/> ;
                          schema:name ?tituloGl .
              }}
              OPTIONAL {{
                ?artigoEs schema:about ?taxon ;
                          schema:isPartOf <https://es.wikipedia.org/> ;
                          schema:name ?tituloEs .
              }}
              FILTER(BOUND(?tituloGl) || BOUND(?tituloEs))
            }}
        """
        data = get_json(SPARQL, {"query": consulta, "format": "json"})

        for fila in data["results"]["bindings"]:
            nome = fila["nome"]["value"]
            entrada = atopados.setdefault(nome, {})
            if "tituloGl" in fila:
                entrada.setdefault("gl", fila["tituloGl"]["value"])
            if "tituloEs" in fila:
                entrada.setdefault("es", fila["tituloEs"]["value"])

        log(f"  ... lote {i}: {len(atopados)} especies con artigo")

    return atopados


# Marcas de edición de Wikipedia que sobreviven ao extracto en texto plano.
# Non se quitan todos os corchetes: hai nomes e aclaracións lexítimas dentro.
EDITORIAL = re.compile(
    r"\[\s*(?:\d+|cómpre referencia|cita requerida|cita requirida|sen referencias"
    r"|sic|nota\s*\d*|aclaración requerida|necesaria cita)\s*\]",
    re.IGNORECASE,
)


def limpa(texto: str) -> str:
    """Quita o que sobra da entradiña dun artigo de Wikipedia."""
    texto = EDITORIAL.sub("", texto)
    texto = re.sub(r"\s+", " ", texto)
    # A marca adoita quedar pegada a unha coma ou a un punto: «laverca ,».
    texto = re.sub(r"\s+([,.;:])", r"\1", texto)
    return texto.strip()


def corta(texto: str, tope: int) -> str:
    """Corta en final de frase, non a metade dunha palabra."""
    if len(texto) <= tope:
        return texto
    anaco = texto[:tope]
    punto = max(anaco.rfind(". "), anaco.rfind("? "), anaco.rfind("! "))
    if punto > tope * 0.5:
        return anaco[:punto + 1]
    return anaco.rsplit(" ", 1)[0] + "…"


def extractos(dominio: str, titulos: list[str]) -> dict[str, str]:
    """título -> primeiro parágrafo en texto plano."""
    resultado: dict[str, str] = {}

    # A API admite 20 títulos por petición cando se piden extractos.
    for lote in lotes(titulos, 20):
        data = get_json(f"{dominio}/w/api.php", {
            "action": "query", "format": "json",
            "prop": "extracts",
            "exintro": 1, "explaintext": 1,
            "redirects": 1,
            "titles": "|".join(lote),
        })

        paxinas = data.get("query", {}).get("pages", {})
        # Os redirects cambian o título, así que hai que reconstruír a
        # correspondencia co que pedimos.
        normalizados = {n["to"]: n["from"]
                        for n in data.get("query", {}).get("normalized", [])}
        redirixidos = {r["to"]: r["from"]
                       for r in data.get("query", {}).get("redirects", [])}

        for p in paxinas.values():
            texto = limpa(p.get("extract") or "")
            if len(texto) < MIN_CARACTERES:
                continue
            titulo = p.get("title", "")
            orixinal = redirixidos.get(titulo, titulo)
            orixinal = normalizados.get(orixinal, orixinal)
            resultado[orixinal] = corta(texto, MAX_CARACTERES)

    return resultado


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    nomes = sorted({e["nomeCientifico"] for e in especies if e.get("nomeCientifico")})

    log(f"Buscando artigos de {len(nomes)} especies en Wikidata...")
    por_nome = artigos(nomes)
    log(f"\nCon artigo: {len(por_nome)} especies.\n")

    catalogo: dict[str, dict] = {}

    for codigo, _, dominio in IDIOMAS:
        pendentes = {t[codigo]: sci for sci, t in por_nome.items()
                     if codigo in t and sci not in catalogo}
        if not pendentes:
            continue

        log(f"Descargando {len(pendentes)} entradas de {dominio}...")
        textos = extractos(dominio, sorted(pendentes))

        for titulo, texto in textos.items():
            sci = pendentes.get(titulo)
            if not sci:
                continue
            catalogo[sci] = {
                "texto": texto,
                "idioma": codigo,
                "titulo": titulo,
                "url": f"{dominio}/wiki/{titulo.replace(' ', '_')}",
            }

        log(f"  quedaron {len(catalogo)} especies con texto")

    destino = escribe_json("wikipedia_textos.json", {
        "fonte": "Wikipedia (gl e es)",
        "licenza": "CC BY-SA 4.0",
        "maxCaracteres": MAX_CARACTERES,
        "total": len(catalogo),
        "textos": catalogo,
    })

    en_galego = sum(1 for t in catalogo.values() if t["idioma"] == "gl")

    log("")
    log(f"Especies con texto: {len(catalogo)} de {len(nomes)}")
    log(f"  en galego:        {en_galego}")
    log(f"  en castelán:      {len(catalogo) - en_galego}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
