"""Fonte GBIF: lista base de especies de aves con rexistros en Galicia.

Consulta as ocorrencias de GBIF facetadas por especie, restrinxidas á clase
Aves e á división administrativa de Galicia (GADM ESP.12_1), e enriquece cada
especie coa súa taxonomía e nomes vernáculos.

Uso:
    python etl/gbif_especies.py

Saída:
    etl/out/gbif_especies.json
"""

from __future__ import annotations

from common import escribe_json, get_json, log

GBIF = "https://api.gbif.org/v1"

GADM_GALICIA = "ESP.12_1"
TAXON_AVES = 212  # classKey da clase Aves no backbone de GBIF

# As citas moi escasas adoitan ser erros de identificación, exemplares
# escapados de catividade ou divagantes extremos. Non se descartan, márcanse.
LIMIAR_RARAS = 10

# Só interesan observacións de campo. Exclúense fósiles e exemplares de
# coleccións, que xeorreferencian ao museo e non ao lugar de observación.
BASIS_OF_RECORD = [
    "HUMAN_OBSERVATION",
    "MACHINE_OBSERVATION",
    "OBSERVATION",
    "OCCURRENCE",
]

IDIOMAS_VERNACULOS = {"glg": "gl", "spa": "es", "por": "pt", "eng": "en"}


def especies_con_citas() -> list[dict]:
    """Faceta as ocorrencias por especie e devolve pares (speciesKey, citas)."""
    resultados: list[dict] = []
    offset = 0
    paso = 100

    while True:
        data = get_json(f"{GBIF}/occurrence/search", {
            "gadmGid": GADM_GALICIA,
            "taxonKey": TAXON_AVES,
            "occurrenceStatus": "PRESENT",
            "basisOfRecord": BASIS_OF_RECORD,
            "facet": "speciesKey",
            "facetLimit": paso,
            "facetOffset": offset,
            "limit": 0,
        })

        facetas = data.get("facets", [])
        contas = facetas[0].get("counts", []) if facetas else []
        if not contas:
            break

        resultados.extend({"speciesKey": int(c["name"]), "citas": c["count"]}
                          for c in contas)
        log(f"  ... {len(resultados)} especies facetadas")
        offset += paso

    return resultados


def detalle_especie(species_key: int) -> dict | None:
    """Taxonomía + nomes vernáculos dunha especie. None se non é especie válida."""
    sp = get_json(f"{GBIF}/species/{species_key}")

    if sp.get("rank") != "SPECIES":
        return None

    vernaculos: dict[str, list[str]] = {}
    vn = get_json(f"{GBIF}/species/{species_key}/vernacularNames", {"limit": 100})
    for entrada in vn.get("results", []):
        codigo = IDIOMAS_VERNACULOS.get(entrada.get("language") or "")
        nome = (entrada.get("vernacularName") or "").strip()
        if codigo and nome and nome not in vernaculos.setdefault(codigo, []):
            vernaculos[codigo].append(nome)

    return {
        "gbifKey": species_key,
        "nomeCientifico": sp.get("canonicalName") or sp.get("scientificName"),
        "autoria": sp.get("authorship"),
        "orde": sp.get("order"),
        "familia": sp.get("family"),
        "xenero": sp.get("genus"),
        "estadoTaxonomico": sp.get("taxonomicStatus"),
        "aceptadaKey": sp.get("acceptedKey"),
        "vernaculos": vernaculos,
    }


def main() -> None:
    log(f"Facetando ocorrencias de Aves en Galicia ({GADM_GALICIA})...")
    cruas = especies_con_citas()
    log(f"GBIF devolve {len(cruas)} claves de especie con citas en Galicia.\n")

    especies: list[dict] = []
    descartadas = 0

    for i, fila in enumerate(cruas, 1):
        detalle = detalle_especie(fila["speciesKey"])
        if detalle is None:
            descartadas += 1
            continue

        detalle["citas"] = fila["citas"]
        detalle["rara"] = fila["citas"] < LIMIAR_RARAS
        especies.append(detalle)

        if i % 50 == 0:
            log(f"  ... {i}/{len(cruas)} detalles descargados")

    especies.sort(key=lambda e: -e["citas"])

    destino = escribe_json("gbif_especies.json", {
        "fonte": "GBIF occurrence search",
        "rexion": GADM_GALICIA,
        "licenza": "Datos agregados de GBIF.org",
        "total": len(especies),
        "especies": especies,
    })

    con_galego = sum(1 for e in especies if e["vernaculos"].get("gl"))
    raras = sum(1 for e in especies if e["rara"])

    log("")
    log(f"Especies válidas:        {len(especies)}")
    log(f"  con < {LIMIAR_RARAS} citas (raras):  {raras}")
    log(f"  núcleo habitual:       {len(especies) - raras}")
    log(f"  con nome galego en GBIF: {con_galego}")
    log(f"Descartadas (non rango especie): {descartadas}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
