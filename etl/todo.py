"""Executa todo o ETL en orde e deixa constancia de cando se fixo.

Son nove fontes con dependencias entre elas: GBIF fixa a listaxe de especies e
todo o demais colga dela, e `build.py` ten que ir ao final. Lembralo de memoria
é como se constrúe mal un catálogo.

Cada execución escribe `etl/out/rexistro.json` coa data e o reconto de cada
fonte, e `build.py` copia esa data ao catálogo para que a web poida dicir de
cando son os datos. Sen iso, dentro de seis meses non hai forma de saber se o
que se está a ver é de agosto ou de xaneiro.

Uso:
    python etl/todo.py                 # todo
    python etl/todo.py --rapido        # salta as fontes lentas (fotos e cantos)
    python etl/todo.py --so build      # unha soa etapa
    python etl/todo.py --desde fenoloxia
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from common import OUT_DIR, log

ETL = Path(__file__).resolve().parent
RAIZ = ETL.parent
REXISTRO = OUT_DIR / "rexistro.json"

# A orde importa: `gbif_especies` fixa a listaxe de especies da que dependen
# todas as demais, e `build` ten que ir ao final porque as fusiona.
ETAPAS = [
    ("gbif", "gbif_especies.py", "especies e taxonomía", False),
    ("nomes", "wikidata_nomes.py", "nomes galegos que faltan", False),
    ("rasgos", "avonet_rasgos.py", "tamaño, hábitat e dieta", False),
    ("textos", "wikipedia_textos.py", "descrición de cada especie", False),
    ("conservacion", "iucn_estado.py", "estado da Lista Vermella", False),
    ("fenoloxia", "fenoloxia.py", "en que meses se ve cada especie", False),
    ("zonas", "zonas.py", "comarcas e as súas aves", False),
    ("hotspots", "ebird_hotspots.py", "lugares de observación", False),
    ("galeria", "commons_galeria.py", "galería só en liña", False),
    ("fotos", "wikimedia_fotos.py", "fotos (lenta: descarga 34 MB)", True),
    ("cantos", "xenocanto_cantos.py", "cantos (lenta: descarga e recodifica)", True),
    ("build", "build.py", "fusiona todo no catálogo", False),
]

# De cada saída, o dato que resume canto se conseguiu.
RESUMOS = {
    "gbif_especies.json": ("total", "especies"),
    "wikidata_nomes.json": ("total", "nomes galegos"),
    "avonet_rasgos.json": ("total", "especies con rasgos"),
    "wikipedia_textos.json": ("total", "descricións"),
    "iucn_estado.json": ("total", "especies avaliadas"),
    "fenoloxia.json": ("total", "especies con meses"),
    "zonas.json": ("total", "comarcas"),
    "ebird_hotspots.json": ("total", "lugares"),
    "commons_galeria.json": ("conGaleria", "especies con galería"),
    "wikimedia_fotos.json": ("total", "fotos"),
    "xenocanto_cantos.json": ("total", "cantos"),
}


def executa(guion: str) -> tuple[bool, float]:
    inicio = time.monotonic()
    proc = subprocess.run([sys.executable, str(ETL / guion)], cwd=RAIZ)
    return proc.returncode == 0, time.monotonic() - inicio


def resume_saidas() -> dict[str, dict]:
    """Le as saídas do ETL e queda co reconto de cada unha."""
    resumo: dict[str, dict] = {}
    for ficheiro, (clave, etiqueta) in RESUMOS.items():
        ruta = OUT_DIR / ficheiro
        if not ruta.exists():
            continue
        try:
            datos = json.loads(ruta.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        resumo[ficheiro.removesuffix(".json")] = {
            "conta": datos.get(clave),
            "que": etiqueta,
            # Cando se escribiu de verdade ese ficheiro, que non ten por que
            # ser hoxe: unha execución parcial deixa fontes vellas mesturadas.
            "actualizado": datetime.fromtimestamp(
                ruta.stat().st_mtime, tz=timezone.utc).date().isoformat(),
        }
    return resumo


def main() -> int:
    args = sys.argv[1:]
    rapido = "--rapido" in args

    soamente = None
    if "--so" in args:
        soamente = args[args.index("--so") + 1]

    desde = None
    if "--desde" in args:
        desde = args[args.index("--desde") + 1]

    etapas = ETAPAS
    if soamente:
        etapas = [e for e in ETAPAS if e[0] == soamente]
        if not etapas:
            raise SystemExit(f"Etapa descoñecida: {soamente}. "
                             f"Hai: {', '.join(e[0] for e in ETAPAS)}")
    elif desde:
        nomes = [e[0] for e in ETAPAS]
        if desde not in nomes:
            raise SystemExit(f"Etapa descoñecida: {desde}. "
                             f"Hai: {', '.join(nomes)}")
        etapas = ETAPAS[nomes.index(desde):]

    if rapido:
        etapas = [e for e in etapas if not e[3]]

    log(f"Executando {len(etapas)} etapas.\n")

    resultados = []
    fallos = 0

    for i, (nome, guion, que, _) in enumerate(etapas, 1):
        log(f"\n{'=' * 62}")
        log(f"[{i}/{len(etapas)}] {nome} — {que}")
        log("=" * 62)

        ok, segundos = executa(guion)
        resultados.append({"etapa": nome, "ok": ok, "segundos": round(segundos, 1)})

        if not ok:
            fallos += 1
            log(f"\n!! A etapa «{nome}» fallou.")
            # Non se para: as fontes son independentes entre si e build.py
            # constrúe igual co que haxa. Pararíase se fallase GBIF, que é a
            # base de todo o demais.
            if nome == "gbif":
                log("   É a base de todo o demais: non ten sentido seguir.")
                break

    rexistro = {
        "data": datetime.now(timezone.utc).date().isoformat(),
        "instante": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "completa": not rapido and soamente is None and desde is None,
        "etapas": resultados,
        "fontes": resume_saidas(),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REXISTRO.write_text(
        json.dumps(rexistro, ensure_ascii=False, indent=2), encoding="utf-8")

    log(f"\n{'=' * 62}")
    log(f"Rematado o {rexistro['data']}. {len(resultados) - fallos}/{len(resultados)} etapas ben.")
    for f in rexistro["fontes"].values():
        log(f"  {str(f['conta']):>6}  {f['que']:32} ({f['actualizado']})")
    if fallos:
        log(f"\n{fallos} etapas con erro: "
            + ", ".join(r["etapa"] for r in resultados if not r["ok"]))
    log(f"\nRexistro en {REXISTRO.relative_to(RAIZ)}")

    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
