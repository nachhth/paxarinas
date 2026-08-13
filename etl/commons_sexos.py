"""Sexos e plumaxes: agrupar as fotos da galería en macho, femia e xuvenil.

O oco máis grande que quedaba para identificar unha ave. En moitas especies o
macho e a femia non se parecen en nada —calquera pato— así que amosar unha soa
foto pode ser amosar xusto o que a persoa non viu.

Non hai fonte que dea isto feito, pero Commons deixa dous rastros:

1. **Subcategorías de sexo e idade.** A convención é «<nome científico>
   (male)», «(female)», «(juvenile)», «(subadult)», «(winter plumage)». É un
   rastro deixado a man por quen clasifica en Commons e é o máis fiable que hai.
   Ten ademais unha propiedade que non se pode comprar: **só existen cando a
   especie é dimórfica**. *Erithacus rubecula* non ten «(male)» nin «(female)»
   porque o paporrubio non se distingue; *Anas platyrhynchos* tenas as dúas.
   Así que a ausencia de datos xa é, ela soa, unha resposta razoable.

2. **O título do ficheiro**, en varios idiomas: «male», «macho», «Weibchen»,
   «femelle», «juvenil», «Jungvogel»…

Do que **non** se fía este script:

- **A lista de categorías que xa baixaba a galería non serve.** `cllimit` é un
  tope para a consulta enteira, non por ficheiro: con 50 ficheiros por petición
  tocan dúas categorías cada un. 388 das 518 respostas viñan truncadas. Por iso
  aquí se pregunta polas subcategorías directamente en vez de reler aquilo.
- **Unha foto cun macho e unha femia non é foto de macho.** «Male and female
  mallards», «Gadwall (female & male)», «couple», «pair»: se aparecen os dous
  sexos, ou calquera palabra de parella ou bando, a foto queda sen clasificar.
- **«winter» a secas non é plumaxe de inverno.** «Anas platyrhynchos in winter»
  ou «Winter in Texel» son a estación. Esíxese «winter plumage», «Schlichtkleid»
  ou equivalente.
- **Unha etiqueta de sexo errada é peor que ningunha.** Ante calquera dúbida,
  sen clasificar.

E o mesmo coidado que xa levaba `common.py` cos nomes lexítimos: «ringed» non
se pode descartar porque forma parte de «Little ringed plover», e «nest» tampouco
porque unha cegoña no niño é unha boa foto de cegoña. Aquí a trampa equivalente
é «male» dentro de «female», que se evita esixindo límite de palabra.

Escribe sobre os ficheiros que deixa `commons_galeria.py`, así que **hai que
executalo despois** del. Engade ás fotos que xa había o campo `plumaxe`, e trae
de Commons algunhas máis das que faltan: de nada serve saber agrupar se a
galería trouxo vinte machos e ningunha femia.

Uso:
    python etl/commons_sexos.py
    python etl/commons_sexos.py --auditar 80   (mostra ao chou para revisar)

Saída:
    public/data/galeria/<slug>.json   (co campo `plumaxe` e a lista `grupos`)
    etl/out/commons_sexos.json        (resumo e cobertura)
"""

from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

from common import (OUT_DIR, escribe_json, foto_admisible, get_json, log,
                    sen_html, slug, url_segura)

RAIZ = Path(__file__).resolve().parent.parent
DIR_GALERIA = RAIZ / "public" / "data" / "galeria"

COMMONS = "https://commons.wikimedia.org/w/api.php"

ANCHO_GRELLA = 330
ANCHO_GRANDE = 960

# Cantas fotos como moito por grupo. Seis chegan para ver a variación dun
# plumaxe sen converter a ficha nun álbum.
POR_GRUPO = 6

# Un grupo dunha soa foto non aporta: poñerlle o título «Macho» a unha foto
# solta non lle di nada a ninguén. E cun só grupo non hai nada que comparar,
# que é para o que serve agrupar.
MIN_POR_GRUPO = 2
MIN_GRUPOS = 2

# E un grupo sen o seu contrario tampouco. Poñerlle «Macho» ás fotos dun
# paporrubio é certo —alguén mediuno na man— e aínda así engana: dá a entender
# que se distingue a simple vista, e non se distingue. O que informa non é a
# etiqueta, é o contraste entre as dúas. Así que van en parella ou non van.
PARELLAS = [("macho", "femia"), ("nupcial", "inverno")]
# O eclipse é a plumaxe de descanso do macho: sen o macho ao lado non se le.
DEPENDE = {"eclipse": "macho"}

# Cantas subcategorías se traen por especie. Máis ca isto é pedirlle a Commons
# moito tráfico para encher grupos que xa están cheos.
MAX_SUBCATS = 6

# Orde de aparición na ficha: primeiro o que distingue un exemplar do outro,
# despois o que distingue unha época da outra.
GRUPOS = {
    "macho": "Macho",
    "femia": "Femia",
    "xuvenil": "Xuvenil",
    "eclipse": "Plumaxe de eclipse",
    "nupcial": "Plumaxe nupcial",
    "inverno": "Plumaxe de inverno",
}

# --------------------------------------------------------------- os patróns
#
# Todos con \b: sen iso «male» casaría dentro de «female» e a metade das
# etiquetas sairían do revés, que é exactamente o erro que máis dano fai.

MACHO = re.compile(
    r"\b(males?|machos?|m[aä]nnchen|m[aâ]les?|maschi[oi]|mannetjes?|"
    r"samiec|samce|mu[zž]jak)\b", re.IGNORECASE)

FEMIA = re.compile(
    r"\b(females?|hembras?|f[eê]meas?|weibchen|femelles?|femmin[ae]|"
    # «hunn» (noruegués) quedou fóra: é tamén topónimo, e as fotos que o levan
    # traían xa «female» ao lado, así que non custaba nada quitalo.
    r"vrouwtjes?|femella|samica|[zž]enka)\b", re.IGNORECASE)

# «juv» abreviado é habitualísimo en Commons e sen ambigüidade coñecida.
# «chick», «duckling» e demais tamén entran: unha cría é un paxaro novo, e
# chamarlle xuvenil é certo aínda que non sexa a palabra técnica exacta.
XUVENIL = re.compile(
    r"\b(juveniles?|juvenil|juvenis|juv|juv[eé]nile|immatures?|"
    r"inmadur[oa]s?|jungvogel|jungv[oö]gel|giovane|giovani|subadults?|"
    r"subadult[oa]|nestlings?|fledglings?|pullus|chicks?|ducklings?|"
    r"goslings?|cygnets?|polluelos?|kuiken|1st[- ]?winter|first[- ]?winter|"
    r"1st[- ]?summer|first[- ]?summer)\b", re.IGNORECASE)

ECLIPSE = re.compile(r"\beclipse\b", re.IGNORECASE)

# «summer»/«winter»/«breeding» a secas son a estación ou a época de cría, non o
# plumaxe: hai que esixir a palabra plumaxe ao lado. As alemás xa a levan dentro.
NUPCIAL = re.compile(
    r"\b((breeding|nuptial|summer|alternate)[\s_-]+plumage|"
    r"plumaje[\s_-]+nupcial|plumagem[\s_-]+nupcial|"
    r"plumage[\s_-]+nuptial|prachtkleid|brutkleid|sommerkleid)\b",
    re.IGNORECASE)

INVERNO = re.compile(
    r"\b((winter|non[\s_-]?breeding|nonbreeding|basic)[\s_-]+plumage|"
    r"plumaje[\s_-]+de[\s_-]+invierno|plumagem[\s_-]+de[\s_-]+inverno|"
    r"plumage[\s_-]+internuptial|schlichtkleid|ruhekleid|winterkleid)\b",
    re.IGNORECASE)

# Se hai máis dun paxaro, ou pode habelo, non se etiqueta. Unha foto dunha
# parella etiquetada «Macho» manda a persoa a fixarse no paxaro equivocado.
VARIOS = re.compile(
    r"\b(pairs?|couples?|mating|copulat\w*|breeding[\s_-]+pair|"
    r"parejas?|paar|paare|koppel|flocks?|group|groups|grupo|"
    r"family|families|familie|and[\s_-]+female|and[\s_-]+male|"
    r"und[\s_-]+weibchen|und[\s_-]+m[aä]nnchen|"
    r"y[\s_-]+hembra|y[\s_-]+macho|et[\s_-]+femelle)\b", re.IGNORECASE)

# As subcategorías. Van ancoradas ao final da cadea, porque a forma real é
# «Anas platyrhynchos (male)» e non «Male things». «(mixed pairs)»,
# «(families)» e «(pairs)» quedan fóra por non casar; «in winter» tamén, que é
# a estación e non o plumaxe.
SUBCAT = [
    ("macho",   re.compile(r"\((males?)\)\s*$", re.IGNORECASE)),
    ("femia",   re.compile(r"\((females?)\)\s*$", re.IGNORECASE)),
    ("xuvenil", re.compile(
        r"\((juveniles?|juvenile plumage|immatures?|subadults?|"
        r"chicks?|nestlings?|ducklings?|fledglings?)\)\s*$", re.IGNORECASE)),
    ("eclipse", re.compile(r"\((.*eclipse.*)\)\s*$", re.IGNORECASE)),
    ("nupcial", re.compile(
        r"\(((adult in )?(breeding|nuptial|summer) plumage)\)\s*$",
        re.IGNORECASE)),
    ("inverno", re.compile(
        r"\(((adult in )?(winter|non-?breeding|basic) plumage)\)\s*$",
        re.IGNORECASE)),
]

# Que Commons teña «(male)» e «(female)» adoita significar que a especie é
# dimórfica —ninguén se molesta en separar o que non se distingue— e por iso
# a lista que sae disto é case toda patos, fringílidos e escribentes. Pero hai
# excepcións, e aquí a etiqueta non é falsa: é inútil e enganosa á vez. A
# alguén que quere identificar un paxaro, dous grupos «Macho» e «Femia»
# prométenlle unha diferenza que non vai atopar.
#
# O criterio para entrar nesta lista: **o sexo non se ve a simple vista nun
# exemplar solto**. Non abonda con que sexa difícil.
#
# - *Cygnus olor*: o macho ten o tubérculo negro do bico algo maior, e nada
#   máis. Nunha parella distínguense; nun cisne solto, non.
#
# Quedan dentro, revisados un por un, dous casos límite: *Pandion haliaetus*
# (a femia adoita ter a banda peitoral máis marcada) e *Anas rubripes* (a cor
# do bico), porque aí si hai algo que mirar na foto.
#
# Isto é curación a man e está incompleto a propósito: hai 88 especies con
# grupos de sexo e revisáronse todas unha vez, non dez. Haberá máis.
SEN_DIMORFISMO = {"Cygnus olor"}

# Un híbrido non representa a especie; e unha subcategoría doutro taxon
# colgada aquí tampouco. Esíxese ademais que leve o nome científico.
SUBCAT_FÓRA = re.compile(r"(hybrid|×|captive|feral|museum|illustration|dead)",
                         re.IGNORECASE)


def clasifica(titulo: str) -> str | None:
    """A que grupo pertence esta foto segundo o seu título, ou None.

    Devolve None moito máis a miúdo do que devolve un grupo, e iso é o
    correcto: o custo dun None é unha foto sen agrupar, e o dunha etiqueta
    errada é que alguén descarte a especie que si era.
    """
    t = titulo.replace("_", " ")

    if VARIOS.search(t):
        return None

    macho, femia = bool(MACHO.search(t)), bool(FEMIA.search(t))
    if macho and femia:
        return None            # os dous na mesma foto: non é de ningún

    nupcial, inverno = bool(NUPCIAL.search(t)), bool(INVERNO.search(t))
    if nupcial and inverno:
        return None            # tipicamente unha comparativa

    # A idade manda sobre o sexo: un «immature male» aínda non ten a plumaxe do
    # macho adulto, e ensinalo como «Macho» sería enganar.
    if XUVENIL.search(t):
        return "xuvenil"
    # E o eclipse manda sobre o sexo polo mesmo motivo: un azulón en eclipse
    # parece unha femia, e é xusto a confusión que hai que despexar.
    if ECLIPSE.search(t):
        return "eclipse"
    if macho:
        return "macho"
    if femia:
        return "femia"
    if nupcial:
        return "nupcial"
    if inverno:
        return "inverno"
    return None


def grupo_de_subcat(nome: str, sci: str) -> str | None:
    if SUBCAT_FÓRA.search(nome):
        return None
    if sci.lower() not in nome.lower():
        return None
    for clave, rx in SUBCAT:
        if rx.search(nome):
            return clave
    return None


# ------------------------------------------------------------- peticións
#
# As tres consultas están cacheadas en disco por `get_json`, así que reexecutar
# isto non lle custa nada a Commons.

def subcategorias(sci: str) -> list[str]:
    out: list[str] = []
    cont: dict = {}
    for _ in range(4):
        d = get_json(COMMONS, {
            "action": "query", "format": "json", "list": "categorymembers",
            "cmtitle": f"Category:{sci}", "cmtype": "subcat", "cmlimit": 500,
            **cont})
        out += [m["title"].removeprefix("Category:")
                for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            break
        cont = d["continue"]
    return out


def titulos_da_categoria(sci: str) -> list[str]:
    """Só os nomes dos ficheiros: sen `imageinfo` isto é unha petición barata.

    A galería queda cos vinte primeiros da categoría, e as fotos con sexo no
    título adoitan estar máis abaixo. Por iso aquí se mira a categoría enteira
    (ata mil) antes de decidir de cales pagará a pena pedir os metadatos.
    """
    out: list[str] = []
    cont: dict = {}
    for _ in range(2):
        d = get_json(COMMONS, {
            "action": "query", "format": "json", "list": "categorymembers",
            "cmtitle": f"Category:{sci}", "cmtype": "file", "cmlimit": 500,
            **cont})
        out += [m["title"].removeprefix("File:")
                for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            break
        cont = d["continue"]
    return out


def _extrae(paxina: dict, extra_categoria: str = "") -> dict | None:
    info = (paxina.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata", {})
    titulo = paxina.get("title", "").removeprefix("File:")

    if not info.get("thumburl"):
        return None
    if not (info.get("mime") or "").startswith("image/"):
        return None

    categorias = " · ".join(c.get("title", "")
                            for c in paxina.get("categories", []))
    # A subcategoría de onde vén tamén conta como categoría: se a foto saíu de
    # «… (captive)» xa non entrou aquí, pero o filtro é o mesmo.
    if extra_categoria:
        categorias = f"{categorias} · {extra_categoria}"
    if not foto_admisible(titulo, categorias, meta):
        return None

    def campo(clave: str) -> str | None:
        valor = meta.get(clave, {}).get("value")
        return sen_html(valor) if valor else None

    # A imaxe e mais os dous enlaces só se publican se son http(s): `extmetadata`
    # sae do wikitexto que edita calquera, e a ficha pon eses valores nun `href`.
    miniatura = url_segura(info["thumburl"].split("?")[0])
    if not miniatura:
        return None

    return {
        "ficheiro": titulo,
        "url": miniatura,
        "autor": campo("Artist"),
        "licenza": campo("LicenseShortName"),
        "licenzaUrl": url_segura(meta.get("LicenseUrl", {}).get("value")),
        "orixe": url_segura(info.get("descriptionurl")),
    }


def _paxinas(params: dict, ancho: int) -> dict:
    d = get_json(COMMONS, {
        **params, "action": "query", "format": "json",
        "prop": "imageinfo|categories", "iiprop": "url|extmetadata|mime",
        "iiurlwidth": ancho, "cllimit": 500, "clshow": "!hidden"})
    return d.get("query", {}).get("pages", {})


def fotos_de_subcat(nome: str) -> list[dict]:
    p = {"generator": "categorymembers", "gcmtitle": f"Category:{nome}",
         "gcmtype": "file", "gcmlimit": 50}
    out = []
    for px in _paxinas(p, ANCHO_GRELLA).values():
        f = _extrae(px, nome)
        if f:
            out.append(f)
    return out


def fotos_por_titulo(titulos: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(titulos), 50):
        lote = titulos[i:i + 50]
        p = {"titles": "|".join(f"File:{t}" for t in lote)}
        for px in _paxinas(p, ANCHO_GRELLA).values():
            f = _extrae(px)
            if f:
                out.append(f)
    return out


def engade_grandes(fotos: list[dict]) -> None:
    """A URL de 960 px, que é a que se ve ao ampliar.

    Pídese só das que quedaron: pedila de todas as candidatas sería o dobre de
    tráfico contra Commons para tirar a metade.
    """
    pendentes = [f for f in fotos if "urlGrande" not in f]
    for i in range(0, len(pendentes), 50):
        lote = pendentes[i:i + 50]
        p = {"titles": "|".join(f"File:{f['ficheiro']}" for f in lote)}
        grandes = {}
        for px in _paxinas(p, ANCHO_GRANDE).values():
            info = (px.get("imageinfo") or [{}])[0]
            grande = url_segura((info.get("thumburl") or "").split("?")[0])
            if grande:
                grandes[px["title"].removeprefix("File:")] = grande
        for f in lote:
            # Se a orixinal é menor ca 960, Commons non a amplía: vale a mesma.
            f["urlGrande"] = grandes.get(f["ficheiro"], f["url"])


# --------------------------------------------------------------- o traballo

def procesa(sci: str, galeria: dict | None) -> tuple[dict | None, dict]:
    """Devolve o ficheiro de galería actualizado e un informe da especie."""
    fotos = list(galeria["fotos"]) if galeria else []
    xa = {f["ficheiro"]: f for f in fotos}

    # 1. As que xa temos, polo título. Non custa nin unha petición.
    por_grupo: dict[str, list[dict]] = {g: [] for g in GRUPOS}
    for f in fotos:
        g = clasifica(f["ficheiro"])
        if g:
            f["plumaxe"] = g
            por_grupo[g].append(f)
        else:
            f.pop("plumaxe", None)

    de_subcat = 0

    # 2. As subcategorías de Commons, que é o rastro fiable.
    subcats = [(g, s) for s in subcategorias(sci)
               if (g := grupo_de_subcat(s, sci))]
    # Primeiro os grupos que aínda están baleiros.
    subcats.sort(key=lambda gs: len(por_grupo[gs[0]]))
    for g, nome in subcats[:MAX_SUBCATS]:
        if len(por_grupo[g]) >= POR_GRUPO:
            continue
        for f in fotos_de_subcat(nome):
            if len(por_grupo[g]) >= POR_GRUPO:
                break
            # A subcategoría di o grupo, pero se o título contradí (unha
            # parella dentro de «(male)») gaña o título, que é máis específico.
            t = clasifica(f["ficheiro"])
            if t is not None and t != g:
                continue
            if VARIOS.search(f["ficheiro"].replace("_", " ")):
                continue
            # Se a foto xa estaba na galería, etiquétase alí mesmo. Saltala
            # perdería a etiqueta na seguinte execución, porque o seu título
            # non di nada: o grupo sábese pola subcategoría, non polo nome.
            vella = xa.get(f["ficheiro"])
            if vella is not None:
                if vella.get("plumaxe") == g:
                    continue
                vella["plumaxe"] = g
                por_grupo[g].append(vella)
                de_subcat += 1
                continue
            f["plumaxe"] = g
            f["_novo"] = True
            fotos.append(f)
            xa[f["ficheiro"]] = f
            por_grupo[g].append(f)
            de_subcat += 1

    # 3. O resto da categoría, polo título. A galería quedou cos vinte
    #    primeiros ficheiros e as fotos con sexo no título adoitan estar máis
    #    abaixo, así que aquí é onde aparece a maior parte das femias.
    de_titulo = 0
    candidatos: dict[str, list[str]] = {g: [] for g in GRUPOS}
    for t in titulos_da_categoria(sci):
        if t in xa:
            continue
        g = clasifica(t)
        # Pídense algúns de máis: parte deles caerán no filtro de licenza ou
        # no de «isto non é o paxaro».
        if g and len(candidatos[g]) + len(por_grupo[g]) < POR_GRUPO * 2:
            candidatos[g].append(t)
    quere = {t: g for g, ts in candidatos.items() for t in ts}
    if quere:
        for f in fotos_por_titulo(list(quere)):
            g = quere.get(f["ficheiro"])
            if not g or f["ficheiro"] in xa or len(por_grupo[g]) >= POR_GRUPO:
                continue
            f["plumaxe"] = g
            f["_novo"] = True
            fotos.append(f)
            xa[f["ficheiro"]] = f
            por_grupo[g].append(f)
            de_titulo += 1

    novas = [f for f in fotos if f.get("_novo")]
    for f in novas:
        del f["_novo"]
    if novas:
        engade_grandes(novas)
    # As que veñan sen urlGrande (algo raro na resposta) non se quedan a medias.
    fotos = [f for f in fotos if f.get("urlGrande")]

    # 4. ¿Hai algo que agrupar? Un grupo dunha foto non conta, e con menos de
    #    dous grupos non hai comparación posible: mellor a grella de sempre.
    bos = [g for g in GRUPOS if len(por_grupo[g]) >= MIN_POR_GRUPO]
    if sci in SEN_DIMORFISMO:
        bos = [g for g in bos if g not in ("macho", "femia")]
    for a, b in PARELLAS:
        if (a in bos) != (b in bos):
            bos = [g for g in bos if g not in (a, b)]
    bos = [g for g in bos if DEPENDE.get(g, g) in bos]
    if len(bos) < MIN_GRUPOS:
        bos = []
        for f in fotos:
            f.pop("plumaxe", None)
    else:
        # As etiquetas dos grupos que non chegaron ao mínimo bórranse: nin se
        # amosan nin deben quedar no ficheiro dando a entender que si.
        for f in fotos:
            if f.get("plumaxe") not in bos:
                f.pop("plumaxe", None)

    informe = {
        "grupos": bos,
        "clasificadas": sum(1 for f in fotos if f.get("plumaxe")),
        "fotos": len(fotos),
        "deSubcat": de_subcat,
        "deTitulo": de_titulo,
        "subcats": [s for _, s in subcats],
    }

    if not fotos:
        return None, informe

    saida = {
        "cientifico": sci,
        "fonte": "Wikimedia Commons",
        "fotos": fotos,
    }
    if bos:
        saida["grupos"] = bos
    return saida, informe


# ----------------------------------------------------------------- auditoría

def auditar(n: int) -> None:
    """Mostra ao chou do que quedou etiquetado, para revisar a man.

    Isto non é decorado: unha etiqueta de sexo errada nunha guía leva a
    descartar a especie correcta, así que a taxa de erro hai que mirala, non
    supoñela.
    """
    fichas = sorted(DIR_GALERIA.glob("*.json"))
    mostra = []
    for f in fichas:
        d = json.loads(f.read_text(encoding="utf-8"))
        for foto in d["fotos"]:
            if foto.get("plumaxe"):
                mostra.append((d["cientifico"], foto["plumaxe"], foto["ficheiro"]))
    random.seed(20260813)
    random.shuffle(mostra)
    log(f"Etiquetadas en total: {len(mostra)}. Mostra de {min(n, len(mostra))}:\n")
    for sci, g, t in mostra[:n]:
        log(f"  {g:8s} [{sci}] {t}")


def main() -> None:
    if "--auditar" in sys.argv:
        i = sys.argv.index("--auditar")
        n = int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 60
        auditar(n)
        return

    fonte = OUT_DIR / "gbif_especies.json"
    if not fonte.exists():
        raise SystemExit(f"Falta {fonte}. Executa antes: python etl/gbif_especies.py")
    if not DIR_GALERIA.exists():
        raise SystemExit("Falta a galería. Executa antes: python etl/commons_galeria.py")

    especies = json.loads(fonte.read_text(encoding="utf-8"))["especies"]
    log(f"Clasificando plumaxes de {len(especies)} especies...\n")

    informes: dict[str, dict] = {}
    con_grupos: list[str] = []

    for i, e in enumerate(especies, 1):
        sci = e["nomeCientifico"]
        s = slug(sci)
        ficheiro = DIR_GALERIA / f"{s}.json"
        galeria = (json.loads(ficheiro.read_text(encoding="utf-8"))
                   if ficheiro.exists() else None)

        saida, informe = procesa(sci, galeria)
        informes[sci] = informe

        if saida:
            ficheiro.write_text(
                json.dumps(saida, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
        if informe["grupos"]:
            con_grupos.append(sci)

        if i % 50 == 0:
            log(f"  ... {i}/{len(especies)}  ({len(con_grupos)} con grupos)")

    total_fotos = sum(v["fotos"] for v in informes.values())
    total_clas = sum(v["clasificadas"] for v in informes.values())
    reparto: dict[str, int] = {}
    for f in DIR_GALERIA.glob("*.json"):
        for foto in json.loads(f.read_text(encoding="utf-8"))["fotos"]:
            p = foto.get("plumaxe")
            if p:
                reparto[p] = reparto.get(p, 0) + 1

    destino = escribe_json("commons_sexos.json", {
        "fonte": "Wikimedia Commons (subcategorías de sexo e idade, e títulos)",
        "porGrupo": POR_GRUPO,
        "minPorGrupo": MIN_POR_GRUPO,
        "minGrupos": MIN_GRUPOS,
        "conGrupos": len(con_grupos),
        "especiesConGrupos": sorted(con_grupos),
        "fotosClasificadas": total_clas,
        "fotosTotais": total_fotos,
        "reparto": reparto,
        "porEspecie": {k: v for k, v in sorted(informes.items())
                       if v["grupos"]},
    })

    peso = sum(f.stat().st_size for f in DIR_GALERIA.glob("*.json")) / 1024
    log("")
    log(f"Especies con grupos:  {len(con_grupos)} de {len(especies)}")
    log(f"Fotos clasificadas:   {total_clas} de {total_fotos} "
        f"({100 * total_clas / total_fotos:.1f}%)")
    for g in GRUPOS:
        if reparto.get(g):
            log(f"    {GRUPOS[g]:22s} {reparto[g]}")
    log(f"Peso dos metadatos:   {peso:.0f} kB")
    log(f"\nEscrito en {DIR_GALERIA.relative_to(RAIZ)} e {destino}")
    log("Revisa a mostra:      python etl/commons_sexos.py --auditar 80")


if __name__ == "__main__":
    main()
