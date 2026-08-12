"""Contrasta o estatus estimado contra especies de fenoloxía ben coñecida.

A clasificación de fenoloxia.py é unha heurística sobre datos de observación.
Este script é a rede de seguridade: se se toca o criterio, hai que executalo e
comprobar que non empeora.

Uso:
    python etl/fenoloxia.py && python etl/valida_fenoloxia.py
"""

from __future__ import annotations

import json
import sys

from common import OUT_DIR, log

# Especies comúns en Galicia cuxo estatus non admite discusión. Amplíase con
# gusto: canto máis grande sexa esta lista, máis fiable é a comprobación.
ESPERADO = {
    "Erithacus rubecula": "residente",
    "Turdus merula": "residente",
    "Passer domesticus": "residente",
    "Hirundo rustica": "estival",
    "Delichon urbicum": "estival",
    "Apus apus": "estival",
    "Mareca penelope": "invernante",
    "Anas crecca": "invernante",
    "Vanellus vanellus": "invernante",
    "Numenius phaeopus": "de paso",
}

# Casos coñecidos que a heurística non acerta e que non contan como regresión.
# Ciconia ciconia cría cedo en Iberia (febreiro-xuño) e inverna aquí cada vez
# máis, así que non cabe na xanela abril-setembro que define "estival".
TOLERADOS = {"Ciconia ciconia"}


def barra(meses: list[int]) -> str:
    return "".join("#" if p >= 12 else ("+" if p >= 5 else ("." if p else " "))
                   for p in meses)


def main() -> int:
    ficheiro = OUT_DIR / "fenoloxia.json"
    if not ficheiro.exists():
        raise SystemExit(f"Falta {ficheiro}. Executa antes: python etl/fenoloxia.py")

    datos = json.loads(ficheiro.read_text(encoding="utf-8"))["fenoloxia"]

    fallos = []
    for sci, esperado in sorted(ESPERADO.items()):
        entrada = datos.get(sci)
        if not entrada:
            fallos.append(f"{sci}: non está no catálogo")
            log(f"{sci:24} NON ESTÁ NO CATÁLOGO")
            continue

        obtido = entrada["estatus"]
        ok = obtido == esperado
        if not ok and sci not in TOLERADOS:
            fallos.append(f"{sci}: esperado {esperado}, obtido {obtido}")

        marca = "OK " if ok else ("~~~" if sci in TOLERADOS else "XXX")
        log(f"{sci:24} {esperado:11} -> {obtido:11} {marca} "
            f"[{barra(entrada['meses'])}] n={entrada['total']}")

    log("")
    if fallos:
        log(f"{len(fallos)} regresións:")
        for f in fallos:
            log(f"  - {f}")
        return 1

    log(f"Sen regresións sobre {len(ESPERADO)} especies de control.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
