"""Fonte Wikidata: estado de conservación de cada especie segundo a UICN.

Nunha guía de natureza é información que se dá por suposta: saber se o que
estás a ver está ameazado cambia como o miras.

Non se usa a API da Lista Vermella, que require rexistro e aprobación: Wikidata
mantén a categoría na propiedade P141, referenciada á propia UICN, e é dabondo
para amosar unha etiqueta. Onde a categoría importa de verdade —un informe, unha
publicación— hai que ir á fonte, e por iso cada ficha liga a ela.

Uso:
    python etl/iucn_estado.py

Saída:
    etl/out/iucn_estado.json
"""

from __future__ import annotations

import json

from common import OUT_DIR, escribe_json, get_json, log

SPARQL = "https://query.wikidata.org/sparql"
LOTE = 100

# Identificadores de Wikidata para as categorías da Lista Vermella.
CATEGORIAS = {
    "Q211005": ("LC", "pouco preocupante", 0),
    "Q719675": ("NT", "case ameazada", 1),
    "Q278113": ("VU", "vulnerable", 2),
    # Wikidata ten dous elementos para «en perigo» e úsanse os dous.
    "Q11394": ("EN", "en perigo", 3),
    "Q96377276": ("EN", "en perigo", 3),
    "Q219127": ("CR", "en perigo crítico", 4),
    "Q239509": ("EW", "extinguida en estado silvestre", 5),
    "Q237350": ("EX", "extinguida", 6),
    "Q3245245": ("DD", "datos insuficientes", -1),
    "Q3335065": ("NE", "non avaliada", -1),
}


def lotes(seq: list, tamano: int):
    for i in range(0, len(seq), tamano):
        yield seq[i:i + tamano]


def estados(nomes: list[str]) -> dict[str, str]:
    """nome científico -> QID da categoría da UICN."""
    atopados: dict[str, str] = {}

    for i, lote in enumerate(lotes(nomes, LOTE), 1):
        valores = " ".join(f'"{n}"' for n in lote)
        consulta = f"""
            SELECT ?nome ?categoria WHERE {{
              VALUES ?nome {{ {valores} }}
              ?taxon wdt:P225 ?nome ; wdt:P141 ?categoria .
            }}
        """
        data = get_json(SPARQL, {"query": consulta, "format": "json"})

        for fila in data["results"]["bindings"]:
            nome = fila["nome"]["value"]
            if nome in atopados:
                continue
            atopados[nome] = fila["categoria"]["value"].rsplit("/", 1)[-1]

        log(f"  ... lote {i}: {len(atopados)} especies avaliadas")

    return atopados


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    nomes = sorted({e["nomeCientifico"] for e in especies if e.get("nomeCientifico")})

    log(f"Consultando o estado de conservación de {len(nomes)} especies...")
    crus = estados(nomes)

    catalogo: dict[str, dict] = {}
    descoñecidas: set[str] = set()

    for nome, qid in sorted(crus.items()):
        if qid not in CATEGORIAS:
            descoñecidas.add(qid)
            continue
        codigo, texto, gravidade = CATEGORIAS[qid]
        catalogo[nome] = {
            "codigo": codigo,
            "texto": texto,
            # 2 ou máis é unha das categorías de ameaza da UICN.
            "gravidade": gravidade,
            "ameazada": gravidade >= 2,
        }

    destino = escribe_json("iucn_estado.json", {
        "fonte": "UICN, vía Wikidata (P141)",
        "url": "https://www.iucnredlist.org",
        "total": len(catalogo),
        "estados": catalogo,
    })

    reconto: dict[str, int] = {}
    for e in catalogo.values():
        reconto[e["codigo"]] = reconto.get(e["codigo"], 0) + 1

    log("")
    log(f"Especies avaliadas: {len(catalogo)} de {len(nomes)}")
    # Por gravidade e sen repetir: hai códigos con máis dun QID en Wikidata.
    orde = sorted({(g, c) for c, _, g in CATEGORIAS.values()}, reverse=True)
    for _, codigo in orde:
        if codigo in reconto:
            log(f"  {codigo}  {reconto[codigo]:4}")
    ameazadas = sum(1 for e in catalogo.values() if e["ameazada"])
    log(f"\nEn algunha categoría de ameaza: {ameazadas}")
    if descoñecidas:
        log(f"Categorías de Wikidata sen mapear: {sorted(descoñecidas)}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
