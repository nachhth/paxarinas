"""Fonte Wikidata: nomes galegos das especies que non o traen de GBIF.

Búscanse por dúas vías, porque non sempre coinciden:
  - P1843 (nome común do taxon) etiquetado en galego, que é a propiedade
    pensada para isto e a máis fiable.
  - A etiqueta do elemento (rdfs:label) en galego, como reserva.

Non substitúe os nomes que xa dá Catalogue of Life a través de GBIF: só enche
os ocos. A prioridade real segue sendo a lista normativa da RAG, cando chegue.

Uso:
    python etl/wikidata_nomes.py

Saída:
    etl/out/wikidata_nomes.json
"""

from __future__ import annotations

import json

from common import OUT_DIR, escribe_json, get_json, log

SPARQL = "https://query.wikidata.org/sparql"
LOTE = 100


def lotes(seq: list, tamano: int):
    for i in range(0, len(seq), tamano):
        yield seq[i:i + tamano]


def nomes_galegos(nomes: list[str]) -> dict[str, dict]:
    """nome científico -> {comun, etiqueta} en galego, os que existan."""
    atopados: dict[str, dict] = {}

    for i, lote in enumerate(lotes(nomes, LOTE), 1):
        valores = " ".join(f'"{n}"' for n in lote)
        consulta = f"""
            SELECT ?nome ?comun ?etiqueta WHERE {{
              VALUES ?nome {{ {valores} }}
              ?taxon wdt:P225 ?nome .
              OPTIONAL {{
                ?taxon wdt:P1843 ?comun .
                FILTER(LANG(?comun) = "gl")
              }}
              OPTIONAL {{
                ?taxon rdfs:label ?etiqueta .
                FILTER(LANG(?etiqueta) = "gl")
              }}
              FILTER(BOUND(?comun) || BOUND(?etiqueta))
            }}
        """
        data = get_json(SPARQL, {"query": consulta, "format": "json"})

        for fila in data["results"]["bindings"]:
            nome = fila["nome"]["value"]
            entrada = atopados.setdefault(nome, {"comun": None, "etiqueta": None})
            if "comun" in fila and not entrada["comun"]:
                entrada["comun"] = fila["comun"]["value"]
            if "etiqueta" in fila and not entrada["etiqueta"]:
                entrada["etiqueta"] = fila["etiqueta"]["value"]

        log(f"  ... lote {i}: {len(atopados)} especies con nome galego")

    return atopados


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]

    # Só se consultan as que non teñen nome galego: son as que importan e
    # aforra máis da metade da consulta.
    sen_nome = sorted({
        e["nomeCientifico"] for e in especies
        if e.get("nomeCientifico") and not e.get("vernaculos", {}).get("gl")
    })
    log(f"{len(sen_nome)} especies sen nome galego. Consultando Wikidata...")

    crus = nomes_galegos(sen_nome)

    catalogo = {}
    latinos = 0

    for nome, dados in sorted(crus.items()):
        # P1843 vai primeiro: é a propiedade de nome común, mentres que a
        # etiqueta do elemento pode ser calquera cousa.
        escollido = dados["comun"] or dados["etiqueta"]
        if not escollido:
            continue

        # Cando unha especie non ten nome popular en galego, a etiqueta de
        # Wikidata adoita ser o propio nome científico. Iso non é un nome
        # galego, e meterío no catálogo sería peor que deixar o oco.
        if escollido.strip().lower() == nome.strip().lower():
            latinos += 1
            continue

        catalogo[nome] = {
            "gl": escollido,
            "propiedade": "P1843" if dados["comun"] else "rdfs:label",
        }

    destino = escribe_json("wikidata_nomes.json", {
        "fonte": "Wikidata",
        "consultadas": len(sen_nome),
        "total": len(catalogo),
        "nomes": catalogo,
    })

    por_p1843 = sum(1 for d in catalogo.values() if d["propiedade"] == "P1843")

    log("")
    log(f"Consultadas:        {len(sen_nome)}")
    log(f"Con nome galego:    {len(catalogo)}")
    log(f"  por P1843:        {por_p1843}")
    log(f"  por etiqueta:     {len(catalogo) - por_p1843}")
    log(f"Descartados por ser o nome científico: {latinos}")
    log(f"Seguen sen nome:    {len(sen_nome) - len(catalogo)}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
