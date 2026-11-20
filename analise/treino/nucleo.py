"""Núcleo do treino: recebe o conjunto já vetorizado pela API e devolve os modelos, as métricas e os metadados.

Não fala com a rede: é o que os testes cobrem. Os parâmetros (árvores, profundidade, semente, percentil do limiar,
mínimo de ensaios por classe, k máximo) vêm da API (application.yml, prefixos ps.modelo e ps.treino), para não
existir uma segunda cópia deles aqui.

Dado simulado prova o encadeamento, nunca a detecção real: o chamador marca o resultado.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import confusion_matrix, f1_score, recall_score
from sklearn.model_selection import GroupKFold

CLASSES = ("normal", "avanco_excessivo", "rotacao_inadequada", "ferramenta_desgastada", "desbalanceamento")
# Medidas que entram no estado da regra (a curtose fica de fora, como na API)
MEDIDAS_DO_ESTADO = ("rms_g", "pico_g", "o1x", "o2x", "o3x", "vel_rms_mm_s")


class ErroDeTreino(RuntimeError):
    """Conjunto que não permite treinar (sem janela normal, por exemplo)."""


@dataclass
class Parametros:
    if_percentil: float = 99.0
    arvores_if: int = 100
    arvores_rf: int = 60
    profundidade_max_rf: int = 10
    semente: int = 42
    min_ensaios_por_classe: int = 2
    k_max: int = 5
    z_atencao: float = 3.0

    @classmethod
    def do_resumo(cls, resumo):
        """Parâmetros que a API manda no resumo do conjunto (rota /treino/servico/conjunto/resumo)."""
        m, t = resumo.get("modelo", {}), resumo.get("treino", {})
        return cls(if_percentil=m.get("if_percentil", 99.0), arvores_if=m.get("arvores_if", 100),
                   arvores_rf=m.get("arvores_rf", 60), profundidade_max_rf=m.get("profundidade_max_rf", 10),
                   semente=m.get("semente", 42), min_ensaios_por_classe=t.get("min_ensaios_por_classe", 2),
                   k_max=t.get("k_max", 5), z_atencao=resumo.get("z_atencao", 3.0))


@dataclass
class Conjunto:
    """Matriz pronta: só as linhas com vetor."""
    nomes: list
    X: np.ndarray            # float64 com NaN onde a característica faltou
    y: np.ndarray            # rótulo (texto)
    grupos: np.ndarray       # ensaio-<id> ou os-<id>
    dias: np.ndarray         # data local
    origens: np.ndarray
    excluidas: dict = field(default_factory=dict)

    @classmethod
    def das_linhas(cls, nomes, linhas):
        """Linhas da API (LinhaConjunto) → matriz. As sem vetor só entram na contagem de excluídas."""
        valores, y, grupos, dias, origens = [], [], [], [], []
        excluidas = Counter()
        for linha in linhas:
            if linha.get("valores") is None:
                excluidas[linha.get("motivo_exclusao") or "sem_vetor"] += 1
                continue
            valores.append([math.nan if v is None else float(v) for v in linha["valores"]])
            y.append(linha["rotulo"])
            grupos.append(linha["grupo"])
            dias.append(str(linha["dia"]))
            origens.append(linha["origem"])
        X = np.array(valores, dtype=np.float64).reshape(len(valores), len(nomes))
        return cls(list(nomes), X, np.array(y, dtype=object), np.array(grupos, dtype=object),
                   np.array(dias, dtype=object), np.array(origens, dtype=object), dict(excluidas))


@dataclass
class Resultado:
    isolation: IsolationForest
    floresta: RandomForestClassifier | None
    nomes: list                      # características usadas, na ordem das colunas dos modelos
    removidas: list                  # características do vetor que ficaram fora (faltavam em alguma janela)
    limiar: float                    # escore de anomalia acima disto = anomalia
    classes: list                    # classes do classificador, na ordem das probabilidades
    classes_fora: list               # [{"classe", "ensaios"}] com menos ensaios que o mínimo
    metricas: dict
    conjunto: dict
    importancia: list                # top 10 [{"nome", "valor"}]
    pesos: dict                      # importância de todas as características (para a explicação)
    avisos: list


def escore_anomalia(modelo, X):
    """Escore de anomalia: quanto MAIOR, mais diferente do normal (= -score_samples do scikit-learn)."""
    return -modelo.score_samples(_f32(X))


def _f32(X):
    """As árvores comparam em float32 (scikit-learn e ONNX): os valores já chegam arredondados da API."""
    return np.asarray(X, dtype=np.float32)


def _colunas_completas(conj):
    """Remove as colunas com algum valor ausente (velocidade que o firmware não mandou, canal sem leitura)."""
    completas = ~np.isnan(conj.X).any(axis=0)
    usadas = [n for n, ok in zip(conj.nomes, completas) if ok]
    removidas = [n for n, ok in zip(conj.nomes, completas) if not ok]
    return conj.X[:, completas], usadas, removidas


def _isolation(p, X_normal):
    return IsolationForest(n_estimators=p.arvores_if, random_state=p.semente).fit(_f32(X_normal))


def _floresta(p, X, y):
    return RandomForestClassifier(n_estimators=p.arvores_rf, max_depth=p.profundidade_max_rf,
                                  class_weight="balanced", random_state=p.semente, n_jobs=1).fit(_f32(X), y)


def _limiar(p, modelo, X_normal):
    return float(np.percentile(escore_anomalia(modelo, X_normal), p.if_percentil))


def _regra_bruta(nomes, X, z_atencao):
    """Nível bruto da regra (z de alguma medida do estado ≥ z de atenção), sem atraso nem histerese."""
    idx = [i for i, n in enumerate(nomes) if n.startswith("z_") and n.split("_", 2)[2] in MEDIDAS_DO_ESTADO]
    if not idx:
        return np.zeros(len(X), dtype=bool)
    return (X[:, idx] >= z_atencao).any(axis=1)


def _taxas(detectou, normal):
    """Falso positivo nas janelas normais e detecção nas não normais."""
    n_norm, n_anor = int(normal.sum()), int((~normal).sum())
    return {
        "falso_positivo": None if n_norm == 0 else float(detectou[normal].mean()),
        "deteccao": None if n_anor == 0 else float(detectou[~normal].mean()),
        "janelas_normais": n_norm,
        "janelas_nao_normais": n_anor,
    }


def _metricas_classe(y_real, y_prev, classes):
    matriz = confusion_matrix(y_real, y_prev, labels=classes)
    recall = recall_score(y_real, y_prev, labels=classes, average=None, zero_division=0)
    return {
        "classes": list(classes),
        "matriz_confusao": matriz.astype(int).tolist(),
        "recall": {c: float(r) for c, r in zip(classes, recall)},
        "f1_macro": float(f1_score(y_real, y_prev, labels=classes, average="macro", zero_division=0)),
        "janelas": int(len(y_real)),
    }


def _validar(p, nomes, X, y, partes, classes_rf):
    """Validação por partes (ensaio ou dia): o modelo nunca vê, no treino, a parte em que é testado.

    Devolve as métricas do classificador (se houver) e a comparação regra × Isolation Forest nas MESMAS janelas.
    """
    y_prev = np.empty(len(y), dtype=object)
    if_detectou = np.zeros(len(y), dtype=bool)
    testada = np.zeros(len(y), dtype=bool)
    em_rf = np.isin(y, classes_rf) if classes_rf else np.zeros(len(y), dtype=bool)
    for treino, teste in partes:
        normal_treino = treino[y[treino] == "normal"]
        if len(normal_treino) < 2:
            continue
        iso = _isolation(p, X[normal_treino])
        limiar = _limiar(p, iso, X[normal_treino])
        if_detectou[teste] = escore_anomalia(iso, X[teste]) > limiar
        testada[teste] = True
        if classes_rf:
            tr = treino[em_rf[treino]]
            if len(set(y[tr])) >= 2:
                rf = _floresta(p, X[tr], y[tr])
                te = teste[em_rf[teste]]
                if len(te):
                    y_prev[te] = rf.predict(_f32(X[te]))
    normal = y == "normal"
    regra = _regra_bruta(nomes, X, p.z_atencao)
    resultado = {
        "janelas_testadas": int(testada.sum()),
        "comparacao": {
            "regra": _taxas(regra[testada], normal[testada]),
            "isolation_forest": _taxas(if_detectou[testada], normal[testada]),
        },
    }
    if classes_rf:
        com_prev = np.array([v is not None for v in y_prev]) & em_rf
        if com_prev.any():
            resultado["classificador"] = _metricas_classe(y[com_prev], y_prev[com_prev], classes_rf)
    return resultado


def _partes_por_ensaio(p, grupos, y, classes_rf):
    """GroupKFold por ensaio: k = menor entre k_max e os ensaios da classe mais rara (mínimo 2). Nunca por linha."""
    por_classe = defaultdict(set)
    for g, c in zip(grupos, y):
        por_classe[c].add(g)
    base = classes_rf or ["normal"]
    rara = min(len(por_classe[c]) for c in base)
    k = max(2, min(p.k_max, rara, len(set(grupos))))
    if len(set(grupos)) < 2:
        return None, 0
    return list(GroupKFold(n_splits=k).split(np.zeros(len(y)), y, grupos)), k


def _partes_por_dia(dias):
    unicos = sorted(set(dias))
    if len(unicos) < 2:
        return None
    return [(np.where(dias != d)[0], np.where(dias == d)[0]) for d in unicos]


def _importancia(p, nomes, X, y, iso, rf, classes_rf):
    """Importância por permutação. Com classificador, pela queda do F1 macro; sem ele, pela mudança média do escore
    de anomalia. Devolve o top 10 e o peso de cada característica (≥ 0)."""
    if rf is not None:
        em = np.isin(y, classes_rf)
        r = permutation_importance(rf, _f32(X[em]), y[em], scoring="f1_macro", n_repeats=5,
                                   random_state=p.semente, n_jobs=1)
        valores = r.importances_mean
    else:
        rng = np.random.default_rng(p.semente)
        base = escore_anomalia(iso, X)
        valores = np.zeros(X.shape[1])
        for j in range(X.shape[1]):
            Xp = X.copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            valores[j] = float(np.mean(np.abs(escore_anomalia(iso, Xp) - base)))
    pesos = {n: max(0.0, float(v)) for n, v in zip(nomes, valores)}
    top = sorted(pesos.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return [{"nome": n, "valor": v} for n, v in top], pesos


def treinar(nomes, linhas, parametros: Parametros) -> Resultado:
    """Treina o Isolation Forest (só normal) e, com 2 classes ou mais, o Random Forest; valida e mede."""
    conj = Conjunto.das_linhas(nomes, linhas)
    if len(conj.y) == 0:
        raise ErroDeTreino("nenhuma janela rotulada com vetor; grave ensaios e recalcule a referência")
    X, usadas, removidas = _colunas_completas(conj)
    if X.shape[1] == 0:
        raise ErroDeTreino("todas as características têm valor ausente em alguma janela")
    y, grupos, dias = conj.y, conj.grupos, conj.dias
    normal = y == "normal"
    if normal.sum() < 2:
        raise ErroDeTreino("o Isolation Forest precisa de janelas normais; grave ensaios normais (T1 e T3)")
    avisos = []
    if removidas:
        avisos.append("características fora por valor ausente: " + ", ".join(removidas))

    # classes do classificador: as que têm pelo menos min_ensaios ensaios (grupos)
    ensaios_por_classe = {c: len(set(grupos[y == c])) for c in CLASSES if (y == c).any()}
    classes_rf = [c for c in CLASSES if ensaios_por_classe.get(c, 0) >= p_min(parametros)]
    classes_fora = [{"classe": c, "ensaios": n} for c, n in ensaios_por_classe.items()
                    if n < parametros.min_ensaios_por_classe]
    if classes_fora:
        avisos.append("classes fora do classificador (menos de %d ensaios): %s" % (
            parametros.min_ensaios_por_classe, ", ".join(f"{c['classe']} ({c['ensaios']})" for c in classes_fora)))
    if len(classes_rf) < 2:
        avisos.append("menos de 2 classes com ensaios suficientes: só o Isolation Forest foi treinado")
        classes_rf = []

    metricas = {}
    partes, k = _partes_por_ensaio(parametros, grupos, y, classes_rf)
    if partes is None:
        metricas["por_ensaio"] = {"aplicavel": False, "motivo": "menos de 2 ensaios"}
    else:
        metricas["por_ensaio"] = {"aplicavel": True, "k": k, **_validar(parametros, usadas, X, y, partes, classes_rf)}
    partes_dia = _partes_por_dia(dias)
    if partes_dia is None:
        metricas["por_dia"] = {"aplicavel": False, "motivo": "não aplicável (1 dia)"}
    else:
        metricas["por_dia"] = {"aplicavel": True, "dias": len(partes_dia),
                               **_validar(parametros, usadas, X, y, partes_dia, classes_rf)}

    iso = _isolation(parametros, X[normal])
    limiar = _limiar(parametros, iso, X[normal])
    rf = None
    if classes_rf:
        em = np.isin(y, classes_rf)
        rf = _floresta(parametros, X[em], y[em])
        classes_rf = [str(c) for c in rf.classes_]
    importancia, pesos = _importancia(parametros, usadas, X, y, iso, rf, classes_rf)
    metricas["limiar_anomalia"] = limiar
    metricas["if_percentil"] = parametros.if_percentil

    conjunto = {
        "janelas": int(len(y)),
        "por_classe": dict(Counter(y.tolist())),
        "por_origem": dict(Counter(conj.origens.tolist())),
        "ensaios_por_classe": ensaios_por_classe,
        "dias": sorted(set(dias.tolist())),
        "excluidas": conj.excluidas,
    }
    return Resultado(iso, rf, usadas, removidas, limiar, classes_rf, classes_fora, metricas, conjunto, importancia,
                     pesos, avisos)


def p_min(parametros):
    return parametros.min_ensaios_por_classe
