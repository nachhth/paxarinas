"""Zonas: as 53 comarcas de Galicia e que aves se ven en cada unha.

Dúas pezas que veñen de sitios distintos:

- A xeometría sae de OpenStreetMap (Overpass), que é a única fonte libre con
  as comarcas galegas delimitadas e nomeadas en galego. GADM, que é o que se
  usa para o resto do ETL, no seu nivel 3 non corresponde ás comarcas e devolve
  os nomes como "n.a.".
- As especies de cada comarca saen de GBIF, facetando por especie as
  ocorrencias que caen dentro do polígono.

Os polígonos de OSM traen ata 6000 puntos por comarca e GBIF rexeita as
consultas con máis de ~160 vértices, así que se simplifican (Douglas-Peucker)
ata caber no orzamento. O mesmo polígono simplificado que se usa para
preguntarlle a GBIF é o que se garda para debuxar o mapa e para saber en que
zona está quen abre a app: se fosen distintos, a zona que che sae marcada
podería non ser aquela da que se contaron as aves.

Uso:
    python etl/zonas.py

Saída:
    etl/out/zonas.json
"""

from __future__ import annotations

import math

from common import escribe_json, get_json, log

OVERPASS = "https://overpass-api.de/api/interpreter"
GBIF = "https://api.gbif.org/v1"
WIKIDATA = "https://query.wikidata.org/sparql"

TAXON_AVES = 212

BASIS_OF_RECORD = [
    "HUMAN_OBSERVATION",
    "MACHINE_OBSERVATION",
    "OBSERVATION",
    "OCCURRENCE",
]

# admin_level 7 é a comarca en España. As de Galicia non teñen competencias
# propias, pero son a división que a xente usa para dicir de onde é.
CONSULTA_OSM = """[out:json][timeout:300];
area["name"="Galicia"]["admin_level"="4"]->.g;
rel(area.g)[boundary=administrative][admin_level=7];
out geom;"""

# GBIF devolve 400 por riba dos ~160 vértices. Déixase marxe: o límite real
# semella estar na lonxitude da URL, non no reconto exacto.
ORZAMENTO_VERTICES = 130

# Illas por debaixo de medio km² non cambian o reconto e comen orzamento.
# Por riba deste limiar entran as Cíes, Ons, Sálvora ou a Illa de Arousa, que
# son precisamente sitios de aves.
AREA_MINIMA_ANEL = 5e-5  # graos²; ~0,45 km² á latitude de Galicia

MAX_ANEIS = 6

# Decimais aos que se redondean as coordenadas. Catro son uns 8 m, de sobra
# para un polígono xa simplificado a centos de metros, e recortan un terzo do
# peso do ficheiro. Redondéase antes de validar, non despois: dous puntos que
# ao redondear caen no mesmo sitio poden cruzar dous lados que en precisión
# completa non se tocaban, e GBIF rexeita ese polígono cun 400.
DECIMAIS = 4

# As comarcas ordénanse por número de especies; por debaixo disto o dato é
# ruído de mostraxe e non se garda para non enchelo de citas soltas.
MINIMO_CITAS_ESPECIE = 3


# ---------------------------------------------------------------- xeometría

def aneis_da_relacion(rel: dict) -> list[list[tuple[float, float]]]:
    """Cose os "ways" dunha relación de OSM en aneis pechados.

    Overpass devolve a fronteira troceada en vías soltas e desordenadas, e
    cada unha pode vir en calquera dos dous sentidos. Vanse pegando polos
    extremos ata pechar cada anel.
    """
    anacos = [
        [(p["lon"], p["lat"]) for p in m["geometry"]]
        for m in rel["members"]
        if m["type"] == "way" and m.get("role") == "outer" and m.get("geometry")
    ]

    aneis: list[list[tuple[float, float]]] = []
    while anacos:
        actual = anacos.pop(0)
        pegouse = True
        while actual[0] != actual[-1] and pegouse:
            pegouse = False
            for i, anaco in enumerate(anacos):
                if anaco[0] == actual[-1]:
                    actual += anaco[1:]
                elif anaco[-1] == actual[-1]:
                    actual += anaco[-2::-1]
                elif anaco[-1] == actual[0]:
                    actual = anaco[:-1] + actual
                elif anaco[0] == actual[0]:
                    actual = anaco[:0:-1] + actual
                else:
                    continue
                anacos.pop(i)
                pegouse = True
                break

        # Un anel que non pecha é un erro de topoloxía en OSM. Descártase: un
        # polígono aberto rompe tanto o debuxo como o punto-en-polígono.
        if actual[0] == actual[-1] and len(actual) >= 4:
            aneis.append(actual)

    return aneis


def area_asinada(anel: list[tuple[float, float]]) -> float:
    """Fórmula do lazo. O signo di o sentido: positivo é antihorario."""
    return sum(
        anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
        for i in range(len(anel) - 1)
    ) / 2


def simplifica(puntos: list[tuple[float, float]], tolerancia: float):
    """Douglas-Peucker sobre unha liña aberta: quita os puntos que non a separan
    máis da tolerancia dada."""
    if len(puntos) < 3:
        return puntos

    (x1, y1), (x2, y2) = puntos[0], puntos[-1]
    dx, dy = x2 - x1, y2 - y1
    norma = dx * dx + dy * dy

    peor, indice = 0.0, 0
    for i in range(1, len(puntos) - 1):
        x, y = puntos[i]
        t = 0.0 if norma == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / norma))
        d = (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2
        if d > peor:
            peor, indice = d, i

    if math.sqrt(peor) > tolerancia:
        return simplifica(puntos[:indice + 1], tolerancia)[:-1] + simplifica(puntos[indice:], tolerancia)
    return [puntos[0], puntos[-1]]


def simplifica_anel(anel: list[tuple[float, float]], tolerancia: float):
    """Simplifica un anel pechado sen deixar de pechalo.

    Douglas-Peucker traballa sobre liñas abertas: se se lle dá un anel, o
    segmento de referencia vai do primeiro punto a si mesmo, ten lonxitude
    cero, e a simplificación sae torta. Córtase o anel en dúas metades polo
    punto máis afastado do inicio, simplifícase cada unha e vólvense pegar.
    """
    aberto = anel[:-1]
    orixe = aberto[0]
    afastado = max(
        range(len(aberto)),
        key=lambda i: (aberto[i][0] - orixe[0]) ** 2 + (aberto[i][1] - orixe[1]) ** 2,
    )
    metade1 = simplifica(aberto[:afastado + 1], tolerancia)
    metade2 = simplifica(aberto[afastado:] + [orixe], tolerancia)
    return metade1[:-1] + metade2


def corte(s1, s2):
    """Punto onde se cortan dous segmentos por dentro, ou None.

    Tocarse nun extremo non conta: os segmentos consecutivos dun anel sempre
    comparten un punto e iso non é un cruzamento.
    """
    (x1, y1), (x2, y2) = s1
    (x3, y3), (x4, y4) = s2
    den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if den == 0:
        return None
    t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den
    u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den
    if 1e-9 < t < 1 - 1e-9 and 1e-9 < u < 1 - 1e-9:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


def busca_lazo(puntos: list[tuple[float, float]]):
    """Primeiro par de lados que se cruzan, co punto de corte."""
    n = len(puntos)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            p = corte((puntos[i], puntos[(i + 1) % n]), (puntos[j], puntos[(j + 1) % n]))
            if p:
                return i, j, p
    return None


def desenreda(anel: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Quita os lazos que deixa a simplificación, ata que o anel sexa simple.

    Ao simplificar a costa, dúas puntas dunha ría poden acabar cruzándose. Un
    polígono así é inválido: GBIF devólveo cun 400 e o punto-en-polígono deixa
    de ser fiable. Cada cruzamento parte o anel en dous lazos; consérvase o
    grande, que é a comarca, e tírase o pequeno, que é o artefacto. O que se
    perde son lascas de poucas hectáreas nas puntas das rías.
    """
    puntos = anel[:-1]

    while (achado := busca_lazo(puntos)) is not None:
        i, j, p = achado
        # Os dous lazos nos que o cruzamento parte o anel.
        a = puntos[:i + 1] + [p] + puntos[j + 1:]
        b = [p] + puntos[i + 1:j + 1]
        puntos = a if abs(area_asinada(a + a[:1])) >= abs(area_asinada(b + b[:1])) else b
        if len(puntos) < 3:
            return []

    return puntos + [puntos[0]]


def autocortase(anel: list[tuple[float, float]]) -> bool:
    return busca_lazo(anel[:-1]) is not None


def redondea(anel: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Redondea o anel e quita os puntos que quedan pegados, mantendo o peche."""
    saida: list[tuple[float, float]] = []
    for x, y in anel:
        p = (round(x, DECIMAIS), round(y, DECIMAIS))
        if not saida or p != saida[-1]:
            saida.append(p)
    if len(saida) > 1 and saida[0] != saida[-1]:
        saida.append(saida[0])
    return saida


def anel_valido(anel: list[tuple[float, float]], tolerancia: float):
    """Simplifica, redondea e desenreda ata que redondear xa non rompa nada.

    Desenredar mete puntos de corte novos, que ao redondearse poden volver
    xerar un cruzamento. Repítese o ciclo ata que sexa estable; con dúas ou
    tres voltas sempre abonda.
    """
    actual = redondea(simplifica_anel(anel, tolerancia))
    for _ in range(8):
        if len(actual) < 4:
            return []
        limpo = redondea(desenreda(actual))
        if limpo == actual:
            return actual if abs(area_asinada(actual)) > 0 else []
        actual = limpo
    return []


def aneis_simplificados(aneis: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Queda co continente e as illas grandes, dentro do orzamento de vértices.

    A tolerancia búscase en vez de fixarse: unha comarca pequena da costa e
    outra grande do interior non admiten a mesma, e o que ten que ser igual
    para todas é o custo, non o detalle.
    """
    grandes = sorted(
        (a for a in aneis if abs(area_asinada(a)) >= AREA_MINIMA_ANEL),
        key=lambda a: -abs(area_asinada(a)),
    )[:MAX_ANEIS]

    if not grandes:  # comarca sen ningún anel por riba do limiar: vale o maior
        grandes = sorted(aneis, key=lambda a: -abs(area_asinada(a)))[:1]

    def a_tolerancia(t: float):
        proba = (anel_valido(a, t) for a in grandes)
        return [a for a in proba if len(a) >= 4]

    # Tolerancia máis grosa que cabe no orzamento de vértices, por bisección.
    baixa, alta = 0.0002, 0.05
    for _ in range(20):
        media = (baixa + alta) / 2
        if sum(len(a) for a in a_tolerancia(media)) <= ORZAMENTO_VERTICES:
            alta = media
        else:
            baixa = media

    return a_tolerancia(alta)


def wkt(aneis: list[list[tuple[float, float]]]) -> str:
    """MULTIPOLYGON co sentido antihorario que esixe GBIF."""
    pezas = []
    for anel in aneis:
        if area_asinada(anel) < 0:
            anel = anel[::-1]
        pezas.append("((" + ",".join(f"{x:.{DECIMAIS}f} {y:.{DECIMAIS}f}" for x, y in anel) + "))")
    return "MULTIPOLYGON(" + ",".join(pezas) + ")"


def centro(aneis: list[list[tuple[float, float]]]) -> tuple[float, float]:
    """Centroide do anel maior. Só se usa para etiquetar o mapa."""
    maior = max(aneis, key=lambda a: abs(area_asinada(a)))
    a = area_asinada(maior)
    if a == 0:
        return maior[0]
    cx = cy = 0.0
    for i in range(len(maior) - 1):
        x1, y1 = maior[i]
        x2, y2 = maior[i + 1]
        cruz = x1 * y2 - x2 * y1
        cx += (x1 + x2) * cruz
        cy += (y1 + y2) * cruz
    return round(cx / (6 * a), 4), round(cy / (6 * a), 4)


# ------------------------------------------------------------------- fontes

def baixa_comarcas() -> list[dict]:
    datos = get_json(OVERPASS, {"data": CONSULTA_OSM})
    return [e for e in datos["elements"] if e.get("members")]


def provincias(qids: list[str]) -> dict[str, str]:
    """Provincia de cada comarca, pola vía do QID que OSM xa trae nas etiquetas.

    OSM non etiqueta a provincia na relación da comarca, e deducila dos
    concellos membros obrigaría a outra volta de consultas.
    """
    valores = " ".join(f"wd:{q}" for q in qids)
    consulta = f"""SELECT ?c ?provLabel WHERE {{
      VALUES ?c {{ {valores} }}
      ?c wdt:P131 ?prov .
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "gl,es" }}
    }}"""

    datos = get_json(WIKIDATA, {"format": "json", "query": consulta})
    saida: dict[str, str] = {}
    for fila in datos["results"]["bindings"]:
        qid = fila["c"]["value"].rsplit("/", 1)[-1]
        nome = fila["provLabel"]["value"]
        # "provincia da Coruña" → "A Coruña"; interesa o nome, non o tipo.
        saida[qid] = nome.replace("provincia de ", "").replace("provincia da ", "")
    return saida


def especies_da_zona(poligono: str) -> dict[int, int]:
    """Faceta por especie as ocorrencias de aves dentro do polígono.

    Máis reintentos do normal: as consultas por xeometría son caras e GBIF
    responde 400 a rachas cando vai cargado, coa mesma URL que un minuto
    despois funciona. Con catro intentos o atrás exponencial só cobre 7 s, que
    non chega para esas rachas.
    """
    contas: dict[int, int] = {}
    offset = 0
    paso = 100

    while True:
        datos = get_json(f"{GBIF}/occurrence/search", {
            "geometry": poligono,
            "taxonKey": TAXON_AVES,
            "occurrenceStatus": "PRESENT",
            "basisOfRecord": BASIS_OF_RECORD,
            "facet": "speciesKey",
            "facetLimit": paso,
            "facetOffset": offset,
            "limit": 0,
        }, retries=7)

        facetas = datos.get("facets", [])
        contas_paso = facetas[0].get("counts", []) if facetas else []
        if not contas_paso:
            return contas

        for c in contas_paso:
            contas[int(c["name"])] = c["count"]
        offset += paso


# --------------------------------------------------------------------- main

def main() -> None:
    log("Baixando as comarcas de OpenStreetMap...")
    cruas = baixa_comarcas()
    log(f"OSM devolve {len(cruas)} comarcas.\n")

    qids = [c["tags"]["wikidata"] for c in cruas if c["tags"].get("wikidata")]
    provs = provincias(qids)
    log(f"Provincia resolta para {len(provs)}/{len(qids)} comarcas.\n")

    zonas: list[dict] = []
    for i, rel in enumerate(cruas, 1):
        etiquetas = rel["tags"]
        nome = etiquetas.get("name:gl") or etiquetas["name"]

        aneis = aneis_simplificados(aneis_da_relacion(rel))
        if not aneis:
            log(f"  aviso: {nome} sen xeometría utilizable, sáltase")
            continue

        poligono = wkt(aneis)
        contas = especies_da_zona(poligono)
        especies = {k: v for k, v in contas.items() if v >= MINIMO_CITAS_ESPECIE}

        zonas.append({
            "id": str(rel["id"]),
            "nome": nome,
            "provincia": provs.get(etiquetas.get("wikidata", ""), None),
            "wikidata": etiquetas.get("wikidata"),
            # Exactamente os mesmos puntos que se lle mandaron a GBIF: a zona
            # que se debuxa e na que se te sitúa ten que ser aquela da que se
            # contaron as aves.
            "aneis": [[[x, y] for x, y in a] for a in aneis],
            "centro": list(centro(aneis)),
            "vertices": sum(len(a) for a in aneis),
            "citas": sum(contas.values()),
            "especies": {str(k): v for k, v in sorted(especies.items(), key=lambda x: -x[1])},
        })

        log(f"  {i:2}/{len(cruas)} {nome:26} {len(especies):3} especies"
            f"  {sum(contas.values()):>7} citas  ({zonas[-1]['vertices']} vértices)")

    zonas.sort(key=lambda z: (z["provincia"] or "", z["nome"]))

    destino = escribe_json("zonas.json", {
        "fonte": "Fronteiras de OpenStreetMap (ODbL); especies de GBIF",
        "nota": "As comarcas non son unha división administrativa con "
                "competencias: úsanse porque son a escala á que a xente "
                "localiza o que ve.",
        "total": len(zonas),
        "zonas": zonas,
    })

    medias = sum(len(z["especies"]) for z in zonas) / len(zonas)
    log("")
    log(f"Zonas:                {len(zonas)}")
    log(f"Especies por zona:    {medias:.0f} de media")
    log(f"Vértices por zona:    {sum(z['vertices'] for z in zonas) / len(zonas):.0f} de media")
    log(f"\nEscrito en {destino}")


if __name__ == "__main__":
    main()
