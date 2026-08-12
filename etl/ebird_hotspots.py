"""Fonte eBird: lugares de observación e contraste da listaxe de especies.

Só se collen agregados. Ao pedir a clave declarouse que non se redistribuirían
rexistros individuais nin datos de observadores, e iso cúmprese: os hotspots son
lugares públicos cun reconto histórico de especies, e a listaxe rexional é unha
relación de especies, sen quen nin cando.

Fai dúas cousas:
  - Sitúa cada hotspot na súa comarca, reutilizando os mesmos polígonos co que
    se contaron as aves de cada zona.
  - Contrasta a listaxe rexional de eBird coa nosa de GBIF. Non modifica o
    catálogo: é un sinal de calidade para revisar á man.

Uso:
    python etl/ebird_hotspots.py

Saída:
    etl/out/ebird_hotspots.json
"""

from __future__ import annotations

import json
import os

from common import OUT_DIR, escribe_json, get_json, log

EBIRD = "https://api.ebird.org/v2"
REXION = "ES-GA"

# Por debaixo dun puñado de especies un hotspot non lle serve a ninguén: adoitan
# ser paradas soltas dunha única visita.
MINIMO_ESPECIES = 20


def ebird(ruta: str, params: dict | None = None) -> list | dict:
    """A clave vai como parámetro e non como cabeceira: get_json cachea por URL."""
    clave = os.environ.get("EBIRD_API_KEY", "").strip()
    if not clave:
        raise SystemExit("Falta EBIRD_API_KEY no .env")
    return get_json(f"{EBIRD}/{ruta}", {**(params or {}), "key": clave})


def dentro(punto: tuple[float, float], anel: list[list[float]]) -> bool:
    """Algoritmo do raio: conta cortes cunha semirrecta horizontal."""
    x, y = punto
    dentro_ = False
    n = len(anel)
    for i in range(n):
        x1, y1 = anel[i]
        x2, y2 = anel[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            corte = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if x < corte:
                dentro_ = not dentro_
    return dentro_


def comarca_de(lon: float, lat: float, zonas: list[dict]) -> str | None:
    """Primeiro anel é o continental; os demais son illas, e tamén contan."""
    for z in zonas:
        if any(dentro((lon, lat), anel) for anel in z["aneis"]):
            return z["id"]
    return None


def carga_zonas() -> list[dict]:
    ficheiro = OUT_DIR / "zonas.json"
    if not ficheiro.exists():
        log("Aviso: sen zonas.json. Os hotspots quedarán sen comarca.")
        return []
    return json.loads(ficheiro.read_text(encoding="utf-8"))["zonas"]


def contrasta_listaxe() -> dict:
    """Que especies ve eBird en Galicia e a nosa listaxe de GBIF non, e ao revés."""
    codigos = set(ebird(f"product/spplist/{REXION}"))
    taxonomia = ebird("ref/taxonomy/ebird", {"fmt": "json"})
    cientifico_de = {t["speciesCode"]: t.get("sciName") for t in taxonomia}

    en_ebird = {cientifico_de.get(c) for c in codigos if cientifico_de.get(c)}

    fonte = OUT_DIR / "gbif_especies.json"
    nosas = {e["nomeCientifico"] for e in
             json.loads(fonte.read_text(encoding="utf-8"))["especies"]}

    so_ebird = sorted(en_ebird - nosas)

    # eBird rexistra híbridos e formas domésticas como taxons propios; o
    # backbone de GBIF non. Sepáranse para que non se lean como especies que
    # nos falten, porque non o son.
    hibridos = [n for n in so_ebird if " x " in n or "sp." in n or "Domestic" in n]
    resto = [n for n in so_ebird if n not in hibridos]

    return {
        "nota": "As diferenzas non son ocos de cobertura. eBird usa a taxonomía "
                "de Clements e GBIF o seu propio backbone, así que a maioría son "
                "o mesmo paxaro con outro nome (Astur gentilis = Accipiter "
                "gentilis, Gulosus aristotelis = Phalacrocorax aristotelis). O "
                "resto son híbridos, que eBird trata como taxons e GBIF non.",
        "enEbird": len(en_ebird),
        "nasNosas": len(nosas),
        "hibridosEFormasDomesticas": hibridos,
        "renomeadosOuAusentes": resto,
        "soNasNosas": sorted(nosas - en_ebird),
    }


def main() -> None:
    zonas = carga_zonas()

    log(f"Descargando hotspots de {REXION}...")
    cru = ebird(f"ref/hotspot/{REXION}", {"fmt": "json"})
    log(f"eBird devolve {len(cru)} hotspots.\n")

    hotspots = []
    sen_comarca = 0

    for h in cru:
        n = h.get("numSpeciesAllTime") or 0
        if n < MINIMO_ESPECIES:
            continue

        lon, lat = h["lng"], h["lat"]
        comarca = comarca_de(lon, lat, zonas) if zonas else None
        if zonas and comarca is None:
            # Hotspots mariños e das illas exteriores caen fóra dos polígonos
            # simplificados. Non se descartan: quedan sen comarca.
            sen_comarca += 1

        hotspots.append({
            "id": h["locId"],
            "nome": h.get("locName"),
            "lon": round(lon, 5),
            "lat": round(lat, 5),
            "especies": n,
            "comarca": comarca,
        })

    hotspots.sort(key=lambda x: -x["especies"])

    log("Contrastando a listaxe rexional de eBird coa nosa...")
    contraste = contrasta_listaxe()

    destino = escribe_json("ebird_hotspots.json", {
        "fonte": "eBird API 2.0 (agregados: lugares e listaxe rexional)",
        "rexion": REXION,
        "minimoEspecies": MINIMO_ESPECIES,
        "total": len(hotspots),
        "hotspots": hotspots,
        "contraste": contraste,
    })

    por_comarca: dict[str, int] = {}
    for h in hotspots:
        if h["comarca"]:
            por_comarca[h["comarca"]] = por_comarca.get(h["comarca"], 0) + 1

    log("")
    log(f"Hotspots con {MINIMO_ESPECIES}+ especies: {len(hotspots)} de {len(cru)}")
    log(f"  situados nunha comarca: {len(hotspots) - sen_comarca}")
    log(f"  fóra dos polígonos (mar, illas): {sen_comarca}")
    log(f"  comarcas con algún hotspot: {len(por_comarca)} de {len(zonas)}")
    log("")
    log(f"Listaxe de eBird: {contraste['enEbird']} especies")
    log(f"A nosa de GBIF:   {contraste['nasNosas']} especies")
    log(f"  híbridos e formas domésticas (só eBird): "
        f"{len(contraste['hibridosEFormasDomesticas'])}")
    log(f"  renomeadas ou ausentes (só eBird):       "
        f"{len(contraste['renomeadosOuAusentes'])}")
    log(f"  só nas nosas:                            "
        f"{len(contraste['soNasNosas'])}")
    log("  (as diferenzas son taxonómicas, non ocos de cobertura)")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
