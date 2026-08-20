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
import re
from collections import Counter
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

# Onde `commons_galeria.py` deixa un ficheiro por especie. Aquí só se mira se
# existe: ver `ten_galeria`.
DIR_GALERIA = RAIZ / "public" / "data" / "galeria"


def primeiro(lista: list[str] | None) -> str | None:
    return lista[0] if lista else None


# Entradas que non son un nome: «Common/Arctic Tern» (dúas especies que quen
# anotou non soubo distinguir), «Goshawk, Northern Goshawk» (dous nomes nun
# campo), «(southern and northern) guillemot».
NON_NOME = re.compile(r"[/(),]")

# Un nome ten que ter algunha minúscula. Isto é o que bota fóra os códigos de
# anelamento de catro letras que GBIF trae como se fosen nomes ingleses: WYWA,
# GRTI, EUWR. Ver `escolle_nome` para por que aparecían na ficha.
# Palabras que non levan maiúscula pero que adoitan preceder un nome propio.
NEXOS = {"de", "do", "da", "dos", "das", "del", "of", "d'"}

TEN_MINUSCULA = re.compile(r"[a-záàâãäéèêëíìîïóòôõöúùûüñçœæ]")


def escolle_nome(candidatos: list[str] | None, idioma: str) -> str | None:
    """O mellor nome popular dunha lista de candidatos de GBIF.

    GBIF non dá *o* nome vernáculo: dá todos os que apareceron en calquera das
    listas que agrega, e devólveos ordenados alfabeticamente. Collendo o
    primeiro —o que se facía antes— o que sae é o que gañe o alfabeto ASCII,
    onde as maiúsculas van antes: por iso a lavandeira verdeal saía como «WYWA»
    e o pimpín como «C F». E entre os nomes de verdade tampouco escollía ben:
    saían «Japanese Snow Fairy» polo ferreiriño rabilongo, «Duck Hawk» polo
    falcón peregrino ou «Billy» pola azulenta.

    O que se fai en troques:

      1. Bótanse fóra as entradas que non son un nome (ver `NON_NOME`), os
         códigos e as que rematan en punto, que na lista inglesa son sempre
         nomes casteláns mal etiquetados («Búho real.»).
      2. Gaña o substantivo final máis repetido en toda a lista. É o que
         distingue o nome que usa moita xente do que usou unha soa lista: das
         dezasete entradas da azulenta común, «dunnock» está en varias e
         «Hedgepop» nunha.
      3. Dentro dese grupo, o nome máis repetido e, en igualdade, o máis longo:
         entre «Chaffinch» e «Common Chaffinch» quédase co segundo, que é o
         que non se confunde con outra especie.
      4. Só ao final se escolle como se escribe. En inglés os nomes de especie
         van en maiúsculas («Great Tit»); en galego, castelán e portugués só a
         primeira («Carbonero común»), e GBIF trae as dúas formas.

    Non é unha autoridade taxonómica: é o mellor que se pode sacar do que hai.
    Cando chegue a lista da RAG, para o galego manda esa.
    """
    bos = [c.strip() for c in (candidatos or []) if c and c.strip()]
    bos = [c for c in bos
           if len(c) >= 3
           and not NON_NOME.search(c)
           and not c.endswith(".")
           and TEN_MINUSCULA.search(c)]
    if not bos:
        return None

    # O galego non entra no concurso de popularidade: só se limpa a lista e se
    # colle o primeiro, coma antes.
    #
    # É o nome que vai de título na ficha, e aquí a pregunta non é cal se usa
    # máis senón cal é o correcto, que é cousa da lista da RAG. Probouse a
    # aplicarlle o mesmo criterio ca ao resto e cambiaba corenta nomes, uns a
    # mellor e outros a peor: «Avefría» pasaba a «Galo da braña», «Píllara
    # cincenta» a «cinsenta» e «Pilriño patimouro» a «Pliro patimouro», que é
    # unha errata da fonte. Cambiar o título de corenta fichas para gañar unhas
    # poucas maiúsculas non paga a pena.
    if idioma == "gl":
        return bos[0][:1].upper() + bos[0][1:]

    def normal(c: str) -> str:
        return re.sub(r"\s+", " ", c.lower())

    def cabeza(c: str) -> str:
        return normal(c).split()[-1]

    veces = Counter(normal(c) for c in bos)
    cabezas = Counter(cabeza(c) for c in bos)

    gañador = max(veces, key=lambda n: (cabezas[cabeza(n)], veces[n], len(n.split()), n))

    # Todas as formas do mesmo nome que só difiren en maiúsculas.
    variantes = [c.split() for c in bos if normal(c) == gañador]

    if idioma == "en":
        # «Great Tit», non «Great tit»: en inglés os nomes de especie van con
        # maiúscula en cada palabra. Escóllese a variante que máis o cumpra.
        mellor = max(variantes, key=lambda ps: sum(1 for p in ps if p[:1].isupper()))
        return " ".join(mellor)

    # Galego, castelán e portugués: «Carbonero común», maiúscula só na primeira
    # palabra. GBIF trae as dúas formas e collendo unha ao chou saían tanto
    # «Lavandera Boyera» coma «lavandera boyera».
    #
    # Mantéñense en maiúscula as palabras que a levan en TODAS as variantes: iso
    # é o que distingue un nome propio dun título mal escrito. «Audouin» vai
    # sempre con maiúscula, así que «Gaivota de Audouin» consérvase; «boyera»
    # aparece en minúscula nalgunha, así que baixa.
    palabras = gañador.split()
    sempre_maiuscula = [
        len(variantes) > 1
        and all(len(v) == len(palabras) and v[i][:1].isupper() for v in variantes)
        for i in range(len(palabras))
    ]
    # Cun só candidato GBIF non dá pista ningunha, e daquela «Curruca
    # Tomillera» quedaba con esa maiúscula do medio. O que si se sabe é que nos
    # nomes de ave o nome propio vai case sempre detrás dunha preposición
    # —«Gaivota de Audouin», «Pardela de Bulwer»—, así que aí respéctase o que
    # veña e no resto baixa.
    for i in range(1, len(palabras)):
        if palabras[i - 1] in NEXOS and any(
                len(v) == len(palabras) and v[i][:1].isupper() for v in variantes):
            sempre_maiuscula[i] = True
    # Só a primeira letra, e non `capitalize()`, que baixaría o resto da
    # palabra: en portugués os nomes van cosidos con guións
    # («gaivota-de-Audouin») e aí dentro tamén hai nomes propios.
    saida = [p[:1].upper() + p[1:] if (i == 0 or sempre_maiuscula[i]) else p
             for i, p in enumerate(palabras)]
    return " ".join(saida)


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


def carga_cantos() -> dict[str, list[dict]]:
    """Gravacións de xeno-canto, coa súa autoría e procedencia.

    Cada especie ten unha lista: o canto e o reclamo. Admítese tamén a saída do
    formato vello (un só dicionario por especie) para que un `build` non falle
    mentres a descarga de xeno-canto vai pola metade.
    """
    ficheiro = OUT_DIR / "xenocanto_cantos.json"
    if not ficheiro.exists():
        log("Aviso: sen xenocanto_cantos.json. O catálogo sairá sen cantos.")
        return {}
    cru = json.loads(ficheiro.read_text(encoding="utf-8"))["cantos"]
    return {sci: (v if isinstance(v, list) else [{**v, "praza": "canto"}])
            for sci, v in cru.items()}


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


def carga_plumaxes() -> dict[str, list[str]]:
    """Que grupos de plumaxe ten a galería de cada especie.

    Vai ao catálogo, e non só ao ficheiro da galería, para que a ficha poida
    avisar antes de que ninguén prema nada: agrupar por sexo é do que máis
    axuda a identificar, e estaba agochado tras un botón.
    """
    ficheiro = OUT_DIR / "commons_sexos.json"
    if not ficheiro.exists():
        log("Aviso: sen commons_sexos.json. As fichas non avisarán das plumaxes.")
        return {}

    datos = json.loads(ficheiro.read_text(encoding="utf-8"))["porEspecie"]
    return {sci: d["grupos"] for sci, d in datos.items() if d.get("grupos")}


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
    plumaxes = carga_plumaxes()

    catalogo = []
    sen_aceptar = 0
    dubidosas: list[str] = []
    slugs_vistos: set[str] = set()

    for e in bruto["especies"]:
        # DOUBTFUL entra; SYNONYM e compañía non.
        #
        # Este filtro deixaba fóra o ferreiriño rabilongo (*Aegithalos
        # caudatus*), con 19.147 citas en Galicia: dos máis comúns que hai. En
        # GBIF, DOUBTFUL é unha dúbida sobre o **nome**, non sobre que o paxaro
        # estea aí, e nunha guía galega non pode faltar por unha discusión
        # taxonómica. Un SYNONYM si hai que descartalo: sería a mesma especie
        # dúas veces con nomes distintos.
        #
        # O silencio era o peor do asunto. O resto do ETL non aplica este filtro,
        # así que baixaba a foto, o canto e a galería desa especie, quedaban no
        # repositorio e non se amosaban en ningures. E como `galegas.json` sae do
        # catálogo, o identificador por son tampouco a podía suxerir nunca.
        # Por iso agora se listan: se algún día entra unha dubidosa que non
        # debía, vese no log en vez de aparecer calada na web.
        estado = e.get("estadoTaxonomico")
        if estado not in ("ACCEPTED", "DOUBTFUL"):
            sen_aceptar += 1
            continue
        if estado == "DOUBTFUL":
            dubidosas.append(e.get("nomeCientifico") or "?")

        sci = e["nomeCientifico"]
        if not sci:
            continue

        s = slug(sci)
        if s in slugs_vistos:
            continue
        slugs_vistos.add(s)

        vern = e.get("vernaculos", {})
        foto = fotos.get(sci)
        clips = cantos.get(sci, [])

        # Catalogue of Life (vía GBIF) manda; Wikidata só enche os ocos. Cando
        # chegue a lista normativa da RAG, entrará por diante das dúas.
        gl = escolle_nome(vern.get("gl"), "gl")
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
                "es": escolle_nome(vern.get("es"), "es"),
                "en": escolle_nome(vern.get("en"), "en"),
                "pt": escolle_nome(vern.get("pt"), "pt"),
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
            # Os campos internos do ETL (id de xeno-canto, ámbito no que se
            # atopou) quedan fóra: non se amosan e o catálogo vai enteiro no
            # bundle de todas as páxinas.
            "cantos": [{
                "praza": c["praza"],
                "ficheiro": c["ficheiro"],
                "autor": c["autor"],
                "licenza": c["licenza"],
                "orixe": c["orixe"],
                "lugar": c["lugar"],
                "pais": c["pais"],
                "tipo": c["tipo"],
            } for c in clips],
            # Sen isto non se pode buscar sen saber o nome, que é o uso real
            # da app: alguén ve un paxaro e quere chegar a el.
            "rasgos": rasgos.get(sci),
            # Wikipedia é CC BY-SA: o texto vai coa súa ligazón ao artigo, que
            # é o que esixe a licenza e ademais dá onde seguir lendo.
            "descricion": textos.get(sci),
            "conservacion": estados.get(sci),
            # Baleiro na maioría: só hai grupos onde a especie os ten de verdade.
            "plumaxes": plumaxes.get(sci, []),
            # Se hai ou non ficheiro de galería. Sen isto, a ficha amosaba o
            # botón «Ver máis fotos» das ~20 especies sen galería, pedía un
            # ficheiro que non existe e remataba nun «non se puideron cargar»
            # que botáballe a culpa á conexión.
            "galeria": (DIR_GALERIA / f"{s}.json").exists(),
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
    con_son = sum(1 for e in catalogo if e["cantos"])
    con_canto = sum(1 for e in catalogo if any(c["praza"] == "canto" for c in e["cantos"]))
    con_reclamo = sum(1 for e in catalogo if any(c["praza"] == "reclamo" for c in e["cantos"]))
    log(f"  con son:         {con_son} ({con_son / len(catalogo):.0%})")
    log(f"    canto:         {con_canto}")
    log(f"    reclamo:       {con_reclamo}")
    con_rasgos = sum(1 for e in catalogo if e["rasgos"])
    log(f"  con rasgos:      {con_rasgos} ({con_rasgos / len(catalogo):.0%})")
    log(f"  con parecidas:   {con_parecidas} ({con_parecidas / len(catalogo):.0%})")
    con_texto = sum(1 for e in catalogo if e["descricion"])
    log(f"  con descrición:  {con_texto} ({con_texto / len(catalogo):.0%})")
    con_galeria = sum(1 for e in catalogo if e["galeria"])
    log(f"  con galería:     {con_galeria} ({con_galeria / len(catalogo):.0%})")
    con_plumaxes = sum(1 for e in catalogo if e["plumaxes"])
    log(f"  con grupos de plumaxe: {con_plumaxes} ({con_plumaxes / len(catalogo):.0%})")
    con_estado = sum(1 for e in catalogo if e["conservacion"])
    ameazadas = sum(1 for e in catalogo if (e["conservacion"] or {}).get("ameazada"))
    log(f"  con estado UICN: {con_estado} ({con_estado / len(catalogo):.0%}), "
        f"{ameazadas} ameazadas")
    log(f"  descartadas por taxonomía non aceptada: {sen_aceptar}")
    if dubidosas:
        log(f"  admitidas con nome dubidoso (DOUBTFUL): {len(dubidosas)}")
        for nome in sorted(dubidosas):
            log(f"    - {nome}")
    log(f"\nEscrito en {DESTINO.relative_to(RAIZ)}")

    constrúe_zonas(catalogo)


if __name__ == "__main__":
    main()
