"""Utilidades compartidas polas fontes do ETL.

Todo o ETL corre fóra de liña respecto da app: descarga, normaliza e escribe
JSON. A app nunca fala coas APIs externas.
"""

from __future__ import annotations

import hashlib
import http.client
import json
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

import os

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


def escribe_json(nome: str, data) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destino = OUT_DIR / nome
    destino.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return destino
