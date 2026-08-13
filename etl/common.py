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
    r"illustrations?|drawings?|paintings?|engravings?|stamps?\b|coins?\b|"
    r"range maps|distribution maps|"
    r"in captivity|captive|aviaries|zoos?\b|falconry|"
    r"museum|collections?)",
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


def foto_admisible(titulo: str, categorias: str, meta: dict) -> bool:
    """Se isto é unha foto do paxaro e se se pode usar."""
    if TITULO_FÓRA.search(titulo):
        return False
    if categorias and CATEGORIA_FÓRA.search(categorias):
        return False
    return licenza_cc_ok(meta)


def escribe_json(nome: str, data) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destino = OUT_DIR / nome
    destino.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return destino
