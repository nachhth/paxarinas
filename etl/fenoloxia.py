"""Fenoloxía: en que meses do ano se ve cada especie en Galicia.

Non sae de eBird. O seu API 2.0 está pensado para observacións recentes e
resumos, e non expón os datos semanais dos "bar charts", que só existen na web.
GBIF, en cambio, ten a data en cada rexistro, así que abonda con facetar por
mes as ocorrencias galegas de cada especie.

O estatus (residente, estival, invernante, de paso) dedúcese da distribución
mensual cunha heurística. É unha estimación a partir de datos de observación,
non unha determinación experta: por iso vai marcada como tal e é o primeiro
que conviría que revisase a SGO.

Uso:
    python etl/fenoloxia.py

Saída:
    etl/out/fenoloxia.json
"""

from __future__ import annotations

import json

from common import OUT_DIR, escribe_json, get_json, log

GBIF = "https://api.gbif.org/v1"
GADM_GALICIA = "ESP.12_1"

BASIS_OF_RECORD = [
    "HUMAN_OBSERVATION",
    "MACHINE_OBSERVATION",
    "OBSERVATION",
    "OCCURRENCE",
]

# Por debaixo disto a distribución mensual é ruído, non fenoloxía.
MINIMO_FIABLE = 50

# Nunha especie repartida por igual cada mes levaría o 8,3% das citas. Esíxese
# que ningún mes baixe do 4% para considerala residente: contar simplemente
# cantos meses superan un limiar baixo confunde os migradores de paso, que
# aparecen case todo o ano en cantidades ínfimas entre os dous picos.
MINIMO_MES_RESIDENTE = 4

# Fracción das citas que ten que caer nunha metade do ano para chamarlle
# estival ou invernante.
FRACCION_ESTACIONAL = 0.70

MESES_CRIA = {4, 5, 6, 7, 8, 9}
MESES_INVERNADA = {10, 11, 12, 1, 2, 3}


def meses_de(species_key: int) -> dict[int, int]:
    data = get_json(f"{GBIF}/occurrence/search", {
        "gadmGid": GADM_GALICIA,
        "speciesKey": species_key,
        "occurrenceStatus": "PRESENT",
        "basisOfRecord": BASIS_OF_RECORD,
        "facet": "month",
        "facetLimit": 12,
        "limit": 0,
    })
    facetas = data.get("facets", [])
    if not facetas:
        return {}
    return {int(c["name"]): c["count"] for c in facetas[0].get("counts", [])}


def clasifica(contas: dict[int, int]) -> tuple[str, list[int], int]:
    """Devolve (estatus, porcentaxes por mes 1-12, total)."""
    total = sum(contas.values())
    if not total:
        return "sen datos", [0] * 12, 0

    porcentaxes = [round(contas.get(m, 0) * 100 / total) for m in range(1, 13)]

    if total < MINIMO_FIABLE:
        return "escasa", porcentaxes, total

    if min(porcentaxes) >= MINIMO_MES_RESIDENTE:
        return "residente", porcentaxes, total

    fraccion_cria = sum(contas.get(m, 0) for m in MESES_CRIA) / total
    fraccion_inverno = sum(contas.get(m, 0) for m in MESES_INVERNADA) / total

    if fraccion_cria >= FRACCION_ESTACIONAL:
        return "estival", porcentaxes, total
    if fraccion_inverno >= FRACCION_ESTACIONAL:
        return "invernante", porcentaxes, total

    # Nin concentrada nun extremo nin presente todo o ano: típico das que só
    # cruzan Galicia nos pasos migratorios.
    return "de paso", porcentaxes, total


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    log(f"Consultando a distribución mensual de {len(especies)} especies...\n")

    catalogo: dict[str, dict] = {}
    reconto: dict[str, int] = {}

    for i, e in enumerate(especies, 1):
        estatus, porcentaxes, total = clasifica(meses_de(e["gbifKey"]))
        catalogo[e["nomeCientifico"]] = {
            "estatus": estatus,
            "meses": porcentaxes,
            "total": total,
            "fiable": estatus not in ("sen datos", "escasa"),
        }
        reconto[estatus] = reconto.get(estatus, 0) + 1

        if i % 50 == 0:
            log(f"  ... {i}/{len(especies)}")

    destino = escribe_json("fenoloxia.json", {
        "fonte": "GBIF (ocorrencias facetadas por mes)",
        "nota": "Estatus estimado a partir da distribución mensual das citas, "
                "non determinado por criterio experto.",
        "total": len(catalogo),
        "fenoloxia": catalogo,
    })

    log("")
    for estatus, n in sorted(reconto.items(), key=lambda x: -x[1]):
        log(f"  {estatus:12} {n:4}")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
