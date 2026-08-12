"""Constrúe o catálogo que consome a app a partir das saídas das fontes.

Por agora só hai unha fonte (GBIF). Cando se engadan Wikidata, xeno-canto ou a
lista normativa da RAG, engádense aquí como capas sucesivas sobre a mesma base:
GBIF fixa a taxonomía e a lista de especies, o resto enriquece.

Uso:
    python etl/gbif_especies.py     # descarga a fonte
    python etl/build.py             # constrúe o catálogo

Saída:
    public/data/especies.json
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


def carga_fotos() -> dict[str, dict]:
    """Metadatos de Wikimedia, se xa se executou esa fonte."""
    ficheiro = OUT_DIR / "wikimedia_fotos.json"
    if not ficheiro.exists():
        log("Aviso: sen wikimedia_fotos.json. O catálogo sairá sen fotos.")
        return {}
    return json.loads(ficheiro.read_text(encoding="utf-8"))["fotos"]


def main() -> None:
    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")

    bruto = json.loads(fonte.read_text(encoding="utf-8"))
    fotos = carga_fotos()
    nomes_wd = carga_nomes_wikidata()
    fenoloxia = carga_fenoloxia()

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
                "autor": foto["autor"],
                "licenza": foto["licenza"],
                "licenzaUrl": foto["licenzaUrl"],
                "orixe": foto["orixe"],
            } if foto else None,
            # Os meses son dato bruto de GBIF; o estatus é unha estimación
            # feita sobre eles. Van xuntos para que a app poida amosar a
            # evidencia ao lado da interpretación.
            "fenoloxia": fenoloxia.get(sci),
            "citas": e["citas"],
            "rara": e["rara"],
            "gbifKey": e["gbifKey"],
        })

    catalogo.sort(key=lambda x: (x["orde"] or "", x["familia"] or "", x["cientifico"]))

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(
        json.dumps({
            "version": 1,
            "fontes": (["GBIF"]
                       + (["Wikidata"] if nomes_wd else [])
                       + (["Wikimedia Commons"] if fotos else [])),
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
    log(f"  descartadas por taxonomía non aceptada: {sen_aceptar}")
    log(f"\nEscrito en {DESTINO.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
