"""Exportação do treino: ONNX dos dois modelos, as árvores em JSON (plano B: avaliar em Java puro) e os metadados.

Os ONNX recebem float32 na ordem de ``metadados["caracteristicas"]``:
- Isolation Forest: saídas ``label`` e ``scores`` (= decision_function do scikit-learn). O escore de anomalia
  usado no PredictSpin é ``-(scores + offset)``, com ``offset`` nos metadados (= -score_samples);
- Random Forest: saídas ``label`` e ``probabilities`` (sem ZipMap), na ordem de ``metadados["classes"]``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import onnxruntime
import skl2onnx
import sklearn
from skl2onnx import to_onnx

OPSET = {"": 17, "ai.onnx.ml": 3}


def onnx_isolation(modelo, n_caracteristicas):
    exemplo = np.zeros((1, n_caracteristicas), dtype=np.float32)
    return to_onnx(modelo, exemplo, target_opset=OPSET).SerializeToString()


def onnx_floresta(modelo, n_caracteristicas):
    exemplo = np.zeros((1, n_caracteristicas), dtype=np.float32)
    return to_onnx(modelo, exemplo, options={id(modelo): {"zipmap": False}}, target_opset=OPSET).SerializeToString()


def _c(n):
    """c(n) do Isolation Forest: comprimento médio de caminho numa árvore de busca binária com n pontos."""
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * (np.log(n - 1.0) + np.euler_gamma) - 2.0 * (n - 1.0) / n


def _arvore(t, folha):
    """Uma árvore do scikit-learn em listas: atributo, limiar, filhos e o valor de cada folha."""
    return {
        "atributo": t.feature.tolist(),
        "limiar": [float(v) for v in t.threshold],
        "esquerda": t.children_left.tolist(),
        "direita": t.children_right.tolist(),
        "folha": [folha(i) for i in range(t.node_count)],
    }


def arvores_json(resultado):
    """Plano B: o bastante para avaliar os dois modelos em Java puro, com o mesmo resultado do ONNX.

    Isolation Forest: em cada árvore, a folha guarda profundidade + c(amostras da folha); o escore é
    2 ** (-média / c(max_samples)) (= -score_samples). Random Forest: a folha guarda as probabilidades das classes
    (contagens normalizadas); a probabilidade final é a média entre as árvores.
    Regra de cada nó: vai para a esquerda quando x[atributo] <= limiar, comparando em float32.
    """
    iso = resultado.isolation
    arvores_if = []
    for estimador, atributos in zip(iso.estimators_, iso.estimators_features_):
        t = estimador.tree_
        profundidade = np.zeros(t.node_count)
        pilha = [(0, 0)]
        while pilha:
            no, d = pilha.pop()
            profundidade[no] = d
            if t.children_left[no] != -1:
                pilha.append((t.children_left[no], d + 1))
                pilha.append((t.children_right[no], d + 1))
        a = _arvore(t, lambda i: float(profundidade[i] + _c(t.n_node_samples[i])) if t.children_left[i] == -1 else 0.0)
        # o estimador vê só as colunas sorteadas para ele (no padrão, todas, na mesma ordem)
        a["atributo"] = [int(atributos[f]) if f >= 0 else -1 for f in a["atributo"]]
        arvores_if.append(a)
    saida = {
        "isolation_forest": {"arvores": arvores_if, "c_max_amostras": float(_c(iso.max_samples_)),
                             "offset": float(iso.offset_)},
    }
    if resultado.floresta is not None:
        arvores_rf = []
        for estimador in resultado.floresta.estimators_:
            t = estimador.tree_

            def folha(i, t=t):
                v = t.value[i][0]
                s = float(v.sum())
                return [float(x / s) if s else 0.0 for x in v]

            arvores_rf.append(_arvore(t, folha))
        saida["random_forest"] = {"arvores": arvores_rf, "classes": list(resultado.classes)}
    return json.dumps(saida, separators=(",", ":")).encode("utf-8")


def metadados(resultado, resumo, simulado, tamanhos):
    """O que a API grava junto com o modelo e o painel mostra."""
    return {
        "versao_vetor": resumo["versao_vetor"],
        "referencia_numero": resumo.get("referencia_numero"),
        "referencia_versao_id": resumo.get("referencia_versao_id"),
        "caracteristicas": list(resultado.nomes),
        "caracteristicas_removidas": list(resultado.removidas),
        "canais": [n[len("canal_"):] for n in resultado.nomes if n.startswith("canal_")],
        "classes": list(resultado.classes),
        "classes_fora": resultado.classes_fora,
        "limiar_anomalia": resultado.limiar,
        "offset_anomalia": float(resultado.isolation.offset_),
        "metricas": resultado.metricas,
        "conjunto": resultado.conjunto,
        "importancia": resultado.importancia,
        "pesos": resultado.pesos,
        "avisos": resultado.avisos,
        "simulado": bool(simulado),
        "aviso_simulado": "dado simulado: não é resultado" if simulado else None,
        "tamanhos_bytes": tamanhos,
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "bibliotecas": {"scikit_learn": sklearn.__version__, "skl2onnx": skl2onnx.__version__,
                        "onnxruntime": onnxruntime.__version__},
    }


def pacote(resultado, resumo, simulado):
    """Arquivos do modelo, prontos para o envio multipart à API: nome → bytes."""
    n = len(resultado.nomes)
    arquivos = {"anomalia.onnx": onnx_isolation(resultado.isolation, n)}
    if resultado.floresta is not None:
        arquivos["classe.onnx"] = onnx_floresta(resultado.floresta, n)
    arquivos["arvores.json"] = arvores_json(resultado)
    tamanhos = {nome: len(dados) for nome, dados in arquivos.items()}
    arquivos["metadados.json"] = json.dumps(metadados(resultado, resumo, simulado, tamanhos), ensure_ascii=False,
                                            indent=1).encode("utf-8")
    return arquivos


def sessao(dados):
    return onnxruntime.InferenceSession(dados, providers=["CPUExecutionProvider"])


def avaliar_onnx(arquivos, X, offset):
    """Escore de anomalia e probabilidades pelo onnxruntime (o que a API faz em Java)."""
    X = np.asarray(X, dtype=np.float32)
    si = sessao(arquivos["anomalia.onnx"])
    scores = si.run(["scores"], {si.get_inputs()[0].name: X})[0].ravel().astype(np.float64)
    escore = -(scores + offset)
    probas = None
    if "classe.onnx" in arquivos:
        sr = sessao(arquivos["classe.onnx"])
        probas = sr.run(["probabilities"], {sr.get_inputs()[0].name: X})[0].astype(np.float64)
    return escore, probas
