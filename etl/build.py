"""Constrúe o catálogo que consome a app a partir das saídas das fontes.

As fontes son capas sucesivas sobre unha mesma base: GBIF fixa a taxonomía e a
listaxe de especies, e o resto enriquece. Se unha fonte non se executou aínda,
o catálogo constrúese igual sen ela.

Uso:
    python etl/gbif_especies.py     # base: especies e taxonomía
    python etl/wikidata_nomes.py    # nomes galegos que faltan
    python etl/wikimedia_fotos.py   # fotos con autoría
    python etl/fenoloxia.py         # distribución mensual
    python etl/xenocanto_cantos.py  # gravacións
    python etl/build.py             # fusiona todo

Saída:
    data/especies.json
"""

from __future__ import annotations

import json
from pathlib import Path

from common import OUT_DIR, log, slug

RAIZ = Path(__file__).resolve().parent.parent

# Vai en data/ e non en public/: a app impórtao en tempo de compilación, para
# que as fichas se poidan prerenderizar e para que non haxa ningunha petición
# de rede que poida fallar no monte.
DESTINO = RAIZ / "data" / "especies.json"

# As zonas van nun ficheiro aparte e non dentro do catálogo: só as necesita a
# páxina do mapa, e Nuxt parte o bundle por rota. Metelas no catálogo faríallas
# baixar a todo o mundo, incluído quen só abre unha ficha.
DESTINO_ZONAS = RAIZ / "data" / "zonas.json"


def primeiro(lista: list[str] | None) -> str | None:
    return lista[0] if lista else None


def carga_nomes_wikidata() -> dict[str, dict]:
    """Nomes galegos de reserva, para as especies que non o traen de GBIF."""
    ficheiro = OUT_DIR / "wikidata_nomes.json"
    if not ficheiro.exists():
        log("Aviso: sen wikidata_nomes.json. Faltarán nomes galegos.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["nomes"]


def carga_fenoloxia() -> dict[str, dict]:
    """En que meses se ve cada especie, e o estatus estimado a partir diso."""
    ficheiro = OUT_DIR / "fenoloxia.json"
    if not ficheiro.exists():
        log("Aviso: sen fenoloxia.json. O catálogo sairá sen meses.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["fenoloxia"]


def carga_cantos() -> dict[str, dict]:
    """Gravacións de xeno-canto, coa súa autoría e procedencia."""
    ficheiro = OUT_DIR / "xenocanto_cantos.json"
    if not ficheiro.exists():
        log("Aviso: sen xenocanto_cantos.json. O catálogo sairá sen cantos.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["cantos"]


def carga_rexistro() -> dict:
    """Cando se descargaron os datos, para poder dicilo na web.

    Se non hai rexistro é que se executaron os guións a man en vez de
    `etl/todo.py`. Non é un erro, pero a web non poderá datar os datos.
    """
    ficheiro = OUT_DIR / "rexistro.json"
    if not ficheiro.exists():
        log("Aviso: sen rexistro.json. O catálogo non levará data. "
            "Executa `python etl/todo.py` para xeralo.")
        return {}
    datos = json.loads(ficheiro.read_text(encoding="utf-8"))
    return {
        "data": datos.get("data"),
        "completa": datos.get("completa", False),
        "fontes": {k: v.get("actualizado") for k, v in datos.get("fontes", {}).items()},
    }


def carga_textos() -> dict[str, dict]:
    """O parágrafo que conta que é cada paxaro."""
    ficheiro = OUT_DIR / "wikipedia_textos.json"
    if not ficheiro.exists():
        log("Aviso: sen wikipedia_textos.json. As fichas irán sen descrición.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["textos"]


def carga_estados() -> dict[str, dict]:
    """Categoría da Lista Vermella da UICN."""
    ficheiro = OUT_DIR / "iucn_estado.json"
    if not ficheiro.exists():
        log("Aviso: sen iucn_estado.json. Non haberá estado de conservación.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["estados"]


def carga_rasgos() -> dict[str, dict]:
    """Tamaño, hábitat e dieta: o que permite buscar sen saber o nome."""
    ficheiro = OUT_DIR / "avonet_rasgos.json"
    if not ficheiro.exists():
        log("Aviso: sen avonet_rasgos.json. Non haberá identificación guiada.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["rasgos"]


def carga_fotos() -> dict[str, dict]:
    """Metadatos de Wikimedia, se xa se executou esa fonte."""
    ficheiro = OUT_DIR / "wikimedia_fotos.json"
    if not ficheiro.exists():
        log("Aviso: sen wikimedia_fotos.json. O catálogo sairá sen fotos.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["fotos"]


def carga_hotspots() -> dict[str, list[dict]]:
    """Lugares de observación de eBird, agrupados por comarca."""
    ficheiro = OUT_DIR / "ebird_hotspots.json"
    if not ficheiro.exists():
        log("Aviso: sen ebird_hotspots.json. As zonas irán sen lugares.")
        return {}

    por_comarca: dict[str, list[dict]] = {}
    for h in json.loads(ficheiro.read_text(encoding="utf-8"))["hotspots"]:
        if not h["comarca"]:
            continue
        por_comarca.setdefault(h["comarca"], []).append(h)
    return por_comarca


def engade_parecidas(catalogo: list[dict], cantas: int = 6) -> int:
    """Para cada especie, con cales se pode confundir.

    Mesma familia e tamaño semellante. É deliberadamente conservador: dúas aves
    da mesma familia e do mesmo porte son as que de verdade se confunden no
    campo, mentres que "parécense de cor" sería inventar, porque non temos cor.

    Compáranse as masas en escala logarítmica: entre 8 e 16 gramos hai a mesma
    diferenza aparente que entre 800 e 1600, e non a que darían os gramos.
    """
    import math

    por_familia: dict[str, list[int]] = {}
    for i, e in enumerate(catalogo):
        if e["familia"]:
            por_familia.setdefault(e["familia"], []).append(i)

    con_parecidas = 0
    for i, e in enumerate(catalogo):
        veciñas = [j for j in por_familia.get(e["familia"] or "", []) if j != i]
        masa = (e["rasgos"] or {}).get("masa")

        if masa and masa > 0:
            def distancia(j: int) -> float:
                outra = (catalogo[j]["rasgos"] or {}).get("masa")
                if not outra or outra <= 0:
                    return float("inf")
                return abs(math.log(outra) - math.log(masa))

            veciñas.sort(key=distancia)
        else:
            # Sen masa non hai criterio de tamaño: quedan as máis citadas, que
            # son as que alguén ten diante con máis probabilidade.
            veciñas.sort(key=lambda j: -catalogo[j]["citas"])

        e["parecidas"] = veciñas[:cantas]
        if e["parecidas"]:
            con_parecidas += 1

    return con_parecidas


def constrúe_zonas(catalogo: list[dict]) -> int:
    """Escribe data/zonas.json coas comarcas e as especies de cada unha.

    As especies gárdanse como índices no catálogo, non como nomes nin claves de
    GBIF: son 53 zonas por ~170 especies e repetir a cadea en cada unha
    multiplicaría por cinco o peso do ficheiro, que viaxa enteiro ao móbil.
    """
    ficheiro = OUT_DIR / "zonas.json"
    if not ficheiro.exists():
        log("Aviso: sen zonas.json. Non haberá mapa por zonas.")
        return 0

    bruto = json.loads(ficheiro.read_text(encoding="utf-8"))
    por_gbif = {e["gbifKey"]: i for i, e in enumerate(catalogo)}
    hotspots = carga_hotspots()

    # Só os mellores de cada comarca: hai 1293 situados e a lista enteira
    # engordaría o ficheiro sen axudar a decidir a onde ir.
    TOPE_LUGARES = 8

    zonas = []
    ignoradas = 0
    for z in bruto["zonas"]:
        indices, citas = [], []
        for clave, n in z["especies"].items():
            i = por_gbif.get(int(clave))
            # Especies que GBIF cita na zona pero que non están no catálogo:
            # sinónimos e taxons non aceptados, que xa se filtraron antes.
            if i is None:
                ignoradas += 1
                continue
            indices.append(i)
            citas.append(n)

        zonas.append({
            "id": z["id"],
            "nome": z["nome"],
            "provincia": z["provincia"],
            "aneis": z["aneis"],
            "centro": z["centro"],
            "citas": z["citas"],
            "especies": indices,
            "citasEspecie": citas,
            "lugares": [
                {"nome": h["nome"], "lon": h["lon"], "lat": h["lat"],
                 "especies": h["especies"]}
                for h in hotspots.get(z["id"], [])[:TOPE_LUGARES]
            ],
        })

    DESTINO_ZONAS.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_ZONAS.write_text(
        json.dumps({
            "version": 1,
            "fontes": ["OpenStreetMap", "GBIF"] + (["eBird"] if hotspots else []),
            "aviso": "As comarcas non teñen competencias propias: úsanse porque "
                     "son a escala á que a xente localiza o que ve. O reconto é "
                     "de citas rexistradas, non de abundancia real: hai máis "
                     "citas onde hai máis xente mirando.",
            "total": len(zonas),
            "zonas": zonas,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    tamano = DESTINO_ZONAS.stat().st_size / 1024
    medias = sum(len(z["especies"]) for z in zonas) / len(zonas)
    log(f"\nZonas: {len(zonas)} comarcas, {medias:.0f} especies de media, {tamano:.0f} kB")
    if ignoradas:
        log(f"  claves de GBIF sen especie no catálogo: {ignoradas}")
    log(f"Escrito en {DESTINO_ZONAS.relative_to(RAIZ)}")
    return len(zonas)


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    bruto = json.loads(fonte.read_text(encoding="utf-8"))
    fotos = carga_fotos()
    nomes_wd = carga_nomes_wikidata()
    fenoloxia = carga_fenoloxia()
    cantos = carga_cantos()
    rasgos = carga_rasgos()
    textos = carga_textos()
    estados = carga_estados()
    rexistro = carga_rexistro()

    catalogo = []
    sen_aceptar = 0
    slugs_vistos: set[str] = set()

    for e in bruto["especies"]:
        if e.get("estadoTaxonomico") != "ACCEPTED":
            sen_aceptar += 1
            continue

        sci = e["nomeCientifico"]
        if not sci:
            continue

        s = slug(sci)
        if s in slugs_vistos:
            continue
        slugs_vistos.add(s)

        vern = e.get("vernaculos", {})
        foto = fotos.get(sci)
        canto = cantos.get(sci)

        # Catalogue of Life (vía GBIF) manda; Wikidata só enche os ocos. Cando
        # chegue a lista normativa da RAG, entrará por diante das dúas.
        gl = primeiro(vern.get("gl"))
        gl_fonte = "Catalogue of Life" if gl else None
        if not gl and sci in nomes_wd:
            gl = nomes_wd[sci]["gl"]
            gl_fonte = "Wikidata"

        catalogo.append({
            "slug": s,
            "cientifico": sci,
            "autoria": e.get("autoria") or None,
            "orde": e.get("orde"),
            "familia": e.get("familia"),
            "xenero": e.get("xenero"),
            "nomes": {
                "gl": gl,
                "glFonte": gl_fonte,
                "es": primeiro(vern.get("es")),
                "en": primeiro(vern.get("en")),
                "pt": primeiro(vern.get("pt")),
            },
            # A atribución viaxa coa imaxe, non nunha táboa aparte: así é
            # imposible mostrar unha foto sen dicir de quen é.
            "foto": {
                "mini": foto["mini"],
                "grande": foto["grande"],
                "anchoGrande": foto.get("anchoGrande"),
                "altoGrande": foto.get("altoGrande"),
                "autor": foto["autor"],
                "licenza": foto["licenza"],
                "licenzaUrl": foto["licenzaUrl"],
                "orixe": foto["orixe"],
            } if foto else None,
            # Igual que coas fotos: a atribución viaxa coa gravación.
            "canto": {
                "ficheiro": canto["ficheiro"],
                "autor": canto["autor"],
                "licenza": canto["licenza"],
                "orixe": canto["orixe"],
                "lugar": canto["lugar"],
                "pais": canto["pais"],
                "tipo": canto["tipo"],
            } if canto else None,
            # Sen isto non se pode buscar sen saber o nome, que é o uso real
            # da app: alguén ve un paxaro e quere chegar a el.
            "rasgos": rasgos.get(sci),
            # Wikipedia é CC BY-SA: o texto vai coa súa ligazón ao artigo, que
            # é o que esixe a licenza e ademais dá onde seguir lendo.
            "descricion": textos.get(sci),
            "conservacion": estados.get(sci),
            # Os meses son dato bruto de GBIF; o estatus é unha estimación
            # feita sobre eles. Van xuntos para que a app poida amosar a
            # evidencia ao lado da interpretación.
            "fenoloxia": fenoloxia.get(sci),
            "citas": e["citas"],
            "rara": e["rara"],
            "gbifKey": e["gbifKey"],
        })

    catalogo.sort(key=lambda x: (x["orde"] or "", x["familia"] or "", x["cientifico"]))

    # Despois de ordenar: as parecidas gárdanse como índices, así que teñen que
    # calcularse coa orde definitiva.
    con_parecidas = engade_parecidas(catalogo)

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(
        json.dumps({
            "version": 1,
            "fontes": (["GBIF"]
                       + (["Wikidata"] if nomes_wd else [])
                       + (["Wikimedia Commons"] if fotos else [])
                       + (["xeno-canto"] if cantos else [])
                       + (["AVONET"] if rasgos else [])
                       + (["Wikipedia"] if textos else [])
                       + (["UICN"] if estados else [])),
            "rexistro": rexistro,
            "avisoFenoloxia": "Estatus estimado a partir da distribución mensual "
                              "das citas de GBIF, non determinado por criterio experto.",
            "total": len(catalogo),
            "especies": catalogo,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    con_gl = sum(1 for e in catalogo if e["nomes"]["gl"])
    familias = len({e["familia"] for e in catalogo if e["familia"]})
    tamano = DESTINO.stat().st_size / 1024

    log(f"Catálogo: {len(catalogo)} especies, {familias} familias, {tamano:.0f} kB")
    de_wd = sum(1 for e in catalogo if e["nomes"]["glFonte"] == "Wikidata")
    log(f"  con nome galego: {con_gl} ({con_gl / len(catalogo):.0%}), {de_wd} deles de Wikidata")
    con_foto = sum(1 for e in catalogo if e["foto"])
    log(f"  con foto:        {con_foto} ({con_foto / len(catalogo):.0%})")
    con_fen = sum(1 for e in catalogo if (e["fenoloxia"] or {}).get("fiable"))
    log(f"  con fenoloxía fiable: {con_fen} ({con_fen / len(catalogo):.0%})")
    con_canto = sum(1 for e in catalogo if e["canto"])
    log(f"  con canto:       {con_canto} ({con_canto / len(catalogo):.0%})")
    con_rasgos = sum(1 for e in catalogo if e["rasgos"])
    log(f"  con rasgos:      {con_rasgos} ({con_rasgos / len(catalogo):.0%})")
    log(f"  con parecidas:   {con_parecidas} ({con_parecidas / len(catalogo):.0%})")
    con_texto = sum(1 for e in catalogo if e["descricion"])
    log(f"  con descrición:  {con_texto} ({con_texto / len(catalogo):.0%})")
    con_estado = sum(1 for e in catalogo if e["conservacion"])
    ameazadas = sum(1 for e in catalogo if (e["conservacion"] or {}).get("ameazada"))
    log(f"  con estado UICN: {con_estado} ({con_estado / len(catalogo):.0%}), "
        f"{ameazadas} ameazadas")
    log(f"  descartadas por taxonomía non aceptada: {sen_aceptar}")
    log(f"\nEscrito en {DESTINO.relative_to(RAIZ)}")

    constrúe_zonas(catalogo)


if __name__ == "__main__":
    main()
