"""Utilidades compartidas polas fontes do ETL.

Todo o ETL corre fóra de liña respecto da app: descarga, normaliza e escribe
JSON. A app nunca fala coas APIs externas.
"""

from __future__ import annotations

import hashlib
import html
import http.client
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ETL_DIR = Path(__file__).resolve().parent
CACHE_DIR = ETL_DIR / ".cache"
OUT_DIR = ETL_DIR / "out"

def _carga_env() -> None:
    """Le o .env da raíz sen dependencias externas.

    As variables xa definidas no contorno teñen prioridade, para poder
    sobrescribir puntualmente sen tocar o ficheiro.
    """
    ficheiro = ETL_DIR.parent / ".env"
    if not ficheiro.exists():
        return
    for liña in ficheiro.read_text(encoding="utf-8").splitlines():
        liña = liña.strip()
        if not liña or liña.startswith("#") or "=" not in liña:
            continue
        clave, valor = liña.split("=", 1)
        os.environ.setdefault(clave.strip(), valor.strip().strip("\"'"))


_carga_env()

# Wikimedia esixe un User-Agent descritivo cun contacto real, e bloquea os
# xenéricos. Configúrase con PAXARINAS_CONTACTO (un correo ou unha URL).
CONTACTO = os.environ.get("PAXARINAS_CONTACTO", "").strip()
USER_AGENT = (
    f"Paxarinas/0.1 (proxecto libre de divulgacion ornitoloxica; {CONTACTO})"
    if CONTACTO else
    "Paxarinas/0.1 (proxecto libre de divulgacion ornitoloxica)"
)

# Ritmo mínimo entre peticións. Sen isto Wikimedia devolve 429 en poucas
# decenas de descargas. Non hai présa: o ETL corre unha vez.
PAUSA_SEGUNDOS = float(os.environ.get("PAXARINAS_PAUSA", "0.35"))

_ultima_peticion = 0.0


def _console_utf8() -> None:
    """A consola de Windows non sempre vén en UTF-8 e aquí hai moito acento."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


_console_utf8()


def log(msg: str) -> None:
    print(msg, flush=True)


# O corte de conexión a media descarga chega como ConnectionResetError, que non
# é un URLError. Hai que abarcar OSError enteiro (URLError e TimeoutError son
# subclases súas) e mais os erros de protocolo de http.client, que non o son.
ERROS_REDE = (OSError, http.client.HTTPException)


def _agarda_quenda() -> None:
    """Espazado global entre peticións, sexan de datos ou de binarios."""
    global _ultima_peticion
    agora = time.monotonic()
    restante = PAUSA_SEGUNDOS - (agora - _ultima_peticion)
    if restante > 0:
        time.sleep(restante)
    _ultima_peticion = time.monotonic()


def _pausa_por_erro(err: Exception, intento: int) -> None:
    """Atrás exponencial, respectando Retry-After cando o servidor o indica."""
    if isinstance(err, urllib.error.HTTPError) and err.code == 429:
        cabeceira = err.headers.get("Retry-After")
        if cabeceira and cabeceira.isdigit():
            time.sleep(min(int(cabeceira), 120))
            return
        # Sen Retry-After, ceder bastante: 5s, 15s, 45s...
        time.sleep(5 * 3 ** intento)
        return
    time.sleep(2 ** intento)


def abre(url: str):
    """Petición HTTP co ritmo e a identificación que esixe Wikimedia."""
    _agarda_quenda()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(req, timeout=120)


def url_segura(url: str | None) -> str | None:
    """A URL se se pode publicar nun enlace, e None se non.

    As licenzas e as páxinas de orixe saen de `extmetadata` de Commons, que se
    xera co wikitexto de cada ficheiro: edítao calquera. A app pon eses valores
    nun `href`, e Vue non sanea os `href`, así que un `javascript:` sería código
    executable a un clic na ficha dun paxaro. Aquí córtase na fonte; a app
    compróbao outra vez ao pintar, porque o catálogo vai versionado e regenérase
    só.
    """
    if not url:
        return None
    limpo = url.strip()
    return limpo if re.match(r"^https?://", limpo, re.IGNORECASE) else None


def slug(texto: str) -> str:
    normal = unicodedata.normalize("NFKD", texto)
    sen_acentos = "".join(c for c in normal if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", sen_acentos.lower()).strip("-")


def get_json(url: str, params: dict | None = None, *, cache: bool = True,
             retries: int = 4) -> dict:
    """GET cunha caché en disco, para non martelar as APIs entre execucións."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"

    cache_file = CACHE_DIR / f"{hashlib.sha256(url.encode()).hexdigest()}.json"
    if cache and cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    last_error: Exception | None = None
    for intento in range(retries):
        try:
            with abre(url) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            break
        except (*ERROS_REDE, json.JSONDecodeError) as err:
            last_error = err
            _pausa_por_erro(err, intento)
    else:
        raise RuntimeError(f"Fallo tras {retries} intentos: {url}") from last_error

    if cache:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def descarga_ficheiro(url: str, destino: Path, *, retries: int = 5) -> bool:
    """Descarga un binario. Devolve False se xa existía (non se volve baixar)."""
    if destino.exists() and destino.stat().st_size > 0:
        return False

    destino.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None

    for intento in range(retries):
        try:
            with abre(url) as resp:
                contido = resp.read()
            # Escríbese ao final e dunha vez: se algo falla non queda un
            # ficheiro a medias que a seguinte execución dea por bo.
            destino.write_bytes(contido)
            return True
        except ERROS_REDE as err:
            last_error = err
            _pausa_por_erro(err, intento)

    raise RuntimeError(f"Non se puido descargar: {url}") from last_error


# ---------------------------------------------------------- Fotos de Commons
#
# As categorías de taxon de Commons non só teñen fotos do paxaro: hai mapas de
# distribución, ilustracións antigas, selos, ovos, esqueletos, exemplares de
# museo e xente. Isto compárteno a foto principal e a galería, porque o erro é
# o mesmo nas dúas: a ficha do asubiador chegou a amosar un selo de correos.
#
# Ollo co exceso. «nest» non pode estar aquí: unha cegoña no niño É unha boa
# foto de cegoña. E «ringed» tampouco, porque forma parte de nomes ingleses
# lexítimos —«Little ringed plover», «Rose-ringed Parakeet»— e descartaba fotos
# perfectamente válidas.
TITULO_FÓRA = re.compile(
    r"\b(map|maps|distribution|range|verbreitung|areal|"
    r"egg|eggs|nestbox|feather|feathers|track|tracks|pellet|"
    r"skeleton|skull|bone|bones|specimen|specimens|taxiderm\w*|mounted|"
    r"stuffed|dead|roadkill|corpse|"
    r"illustration|drawing|plate|lithograph|engraving|painting|stamp|coin|"
    r"sonogram|spectrogram|diagram|chart|graph|logo|sign|label|"
    r"ringing|banding|anillamiento|beringung|baguage|"
    r"birder|birders|birdwatcher\w*|ornithologist\w*|photographer|"
    r"cage|caged|captive|captivity|aviary|falconry|falconer)\b",
    re.IGNORECASE,
)

# As categorías din o que o título cala, e veñen na mesma petición. Foron elas
# as que delataron o selo ruso («Birds on stamps of Russia») e a foto dun
# ornitólogo coa ave na man («Ornithologists»).
CATEGORIA_FÓRA = re.compile(
    r"(ornithologist|birdwatch\w*|birder|people with|humans?\b|"
    r"bird ringing|bird banding|ringing of|banding of|"
    r"taxidermy|specimens?\b|skeletons?|skulls?|"
    # Ovos e niños: iso dinno as categorías aínda que o título cale. É o que
    # deixaba pasar «Aquila adalberti MHNT.ZOO.2010.11.93.5.jpg» como foto da
    # aguia imperial, que é un ovo e non o di en ningures do nome.
    r"eggs?\b|nests?\b|"
    r"illustrations?|drawings?|paintings?|engravings?|stamps?\b|coins?\b|"
    r"range maps|distribution maps|"
    r"in captivity|captive|aviaries|zoos?\b|falconry|"
    # Con acento tamén: as coleccións francesas escríbeno «Muséum».
    r"mus[eé]um|collections?)",
    re.IGNORECASE,
)


def sen_html(texto: str | None) -> str:
    """O campo de autoría de Commons vén como HTML (ligazóns, etiquetas...)."""
    limpo = re.sub(r"<[^>]+>", " ", texto or "")
    return re.sub(r"\s+", " ", html.unescape(limpo)).strip()


def licenza_cc_ok(meta: dict) -> bool:
    """Creative Commons ou dominio público. Sen constancia, non se usa."""
    url = meta.get("LicenseUrl", {}).get("value") or ""
    curta = meta.get("LicenseShortName", {}).get("value") or ""
    return ("creativecommons" in url
            or "public domain" in curta.lower()
            or "CC0" in curta)


# Un ano anterior a 1950 no título ou na data da obra. Antes desa raia case
# todo o que hai en Commons dun paxaro é unha lámina de historia natural, non
# unha fotografía: así se coou «Phylloscopus plumbeitarsus 1889.jpg», un
# gravado da Ornithographia rossica, como foto do picafollas patigrís. As
# palabras «plate» ou «illustration» non sempre están no título nin nas
# categorías; o ano si.
ANO_VELLO = re.compile(r"\b(1[5-8]\d{2}|19[0-4]\d)\b")


def obra_antiga(titulo: str, meta: dict) -> bool:
    if ANO_VELLO.search(titulo):
        return True
    data = sen_html(meta.get("DateTimeOriginal", {}).get("value") or "")
    return bool(ANO_VELLO.search(data))


def foto_admisible(titulo: str, categorias: str, meta: dict) -> bool:
    """Se isto é unha foto do paxaro e se se pode usar."""
    if TITULO_FÓRA.search(titulo):
        return False
    if categorias and CATEGORIA_FÓRA.search(categorias):
        return False
    if obra_antiga(titulo, meta):
        return False
    return licenza_cc_ok(meta)


COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# Subcategorías nas que non hai fotos do paxaro vivo. É o mesmo criterio de
# `CATEGORIA_FÓRA`, pero aplicado antes: aquí decídese en que categorías nin se
# entra, sen gastar unha petición en pedirlles os ficheiros.
SUBCAT_FÓRA = re.compile(
    r"(audio|sound|video|egg|nest|feather|skeleton|skull|bone|specimen|"
    r"taxiderm|museum|collection|illustration|drawing|painting|engraving|"
    r"stamp|coin|map|diagram|sonogram|spectrogram|"
    r"captivity|captive|aviar|zoo|falconry|ringing|banding|"
    r"unidentified|dead|tracks)",
    re.IGNORECASE,
)


def categorias_de(titulos: list[str]) -> dict[str, str]:
    """As categorías visibles de cada ficheiro, sen quedar a medias.

    Hai que pedilas aparte porque a API corta por número TOTAL de categorías na
    resposta, non por ficheiro: pedindo cincuenta ficheiros de golpe volvían
    trinta e seis con categorías e catorce sen ningunha. E como o filtro de
    fotos mira as categorías para saber se aquilo é un paxaro ou un exemplar de
    museo, eses catorce pasaban sen revisar de verdade. Así acabou de foto do
    picanzo real un ovo do Muséum de Toulouse: no título non poñía «egg», e as
    categorías, que si o dicían, chegaran baleiras.

    Séguese a continuación ata que non queda nada. Devólvese xa unido nunha
    cadea, que é como o quere `foto_admisible`.
    """
    xuntas: dict[str, list[str]] = {t: [] for t in titulos}
    if not titulos:
        return {}

    params = {
        "action": "query", "format": "json",
        "titles": "|".join(titulos),
        "prop": "categories",
        "cllimit": "max",
        "clshow": "!hidden",
    }
    while True:
        data = get_json(COMMONS_API, params)
        for paxina in data.get("query", {}).get("pages", {}).values():
            titulo = paxina.get("title", "")
            xuntas.setdefault(titulo, []).extend(
                c.get("title", "") for c in paxina.get("categories", []))
        seguir = data.get("continue")
        if not seguir:
            break
        params = {**params, **seguir}

    return {t: " · ".join(cs) for t, cs in xuntas.items()}


def subcategorias(categoria: str) -> list[str]:
    """As subcategorías onde pode haber fotos do paxaro, xa filtradas."""
    data = get_json(COMMONS_API, {
        "action": "query", "format": "json",
        "list": "categorymembers",
        "cmtitle": categoria,
        "cmtype": "subcat",
        "cmlimit": 50,
    })
    titulos = [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
    return [t for t in titulos if not SUBCAT_FÓRA.search(t)]


def categoria_alternativa(sci: str, familia: str | None = None,
                          xenero: str | None = None) -> str | None:
    """A categoría de Commons desta especie cando non se chama coma ela.

    A taxonomía móvese e Commons vai por diante de GBIF: o corvo mariño
    cristado está en «Gulosus aristotelis», a papuxa do mato en «Curruca
    undata» e o ferreiriño palustre en «Poecile montanus». A categoría co nome
    que dá GBIF existe pero está baleira, así que esas especies quedaban sen
    foto e sen galería tendo centos delas.

    Búscase de dous xeitos. Primeiro o nome enteiro, que é o que atopa as
    erratas do nome científico («sibillatrix» por «sibilatrix»). Se non sae,
    o epíteto no título, porque o buscador non sempre pon a categoría boa entre
    as primeiras: «Curruca melanocephala» quedaba por detrás de «Quality images
    of Sylvia melanocephala».

    Buscar polo epíteto só non abondaría para dar por boa unha categoría: hai
    unha abella que se chama «Euryglossina melanocephala», e as súas fotos
    acabarían na ficha da papuxa. Por iso se comproba a familia: Commons
    clasifica cada categoría de especie dentro de «Species of <familia>», e ese
    é o dato que di se o que se atopou é o mesmo bicho.
    """
    xa = f"Category:{sci}".lower()
    epiteto = sci.split()[-1].lower()

    def candidatas(consulta: str) -> list[str]:
        data = get_json(COMMONS_API, {
            "action": "query", "format": "json",
            "list": "search",
            "srsearch": consulta,
            "srnamespace": 14,   # Category:
            "srlimit": 10,
        })
        saida = []
        for r in data.get("query", {}).get("search", []):
            titulo = r["title"]
            nome = titulo.removeprefix("Category:")
            # Dúas palabras e sen paréntese: iso é un nome de especie, non
            # «... (juvenile)» nin «Quality images of ...».
            if titulo.lower() != xa and len(nome.split()) == 2 and "(" not in nome:
                saida.append(titulo)
        return saida

    directas = candidatas(sci)
    por_epiteto = [c for c in candidatas(f'intitle:"{epiteto}"') if c not in directas]

    for titulo in directas + por_epiteto:
        if (familia or xenero) and not mesmo_bicho(titulo, familia, xenero):
            continue
        return titulo
    return None


def mesmo_bicho(categoria: str, familia: str | None, xenero: str | None) -> bool:
    """Se esa categoría de Commons é do mesmo animal que buscabamos.

    Mírase nas categorías pai, que en Commons son «Species of <familia>» e o
    nome do xénero. Abonda con que coincida unha das dúas: cando a taxonomía
    move unha especie de xénero —«Phalacrocorax aristotelis» pasou a «Gulosus
    aristotelis»— o xénero xa non cadra, e é xustamente ese o caso que se está
    a resolver; e ao revés, unha subespecie pode estar colgada do xénero sen
    que a familia apareza escrita.
    """
    data = get_json(COMMONS_API, {
        "action": "query", "format": "json",
        "titles": categoria,
        "prop": "categories",
        "cllimit": 50,
        "clshow": "!hidden",
    })
    for paxina in data.get("query", {}).get("pages", {}).values():
        pais = " · ".join(c.get("title", "") for c in paxina.get("categories", [])).lower()
        if familia and familia.lower() in pais:
            return True
        if xenero and f"category:{xenero.lower()}" in pais:
            return True
    return False


def escribe_json(nome: str, data) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destino = OUT_DIR / nome
    destino.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return destino
