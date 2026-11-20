"""Conjunto SINTÉTICO no formato da API e o modelo de fixture dos testes da API Java.

O sinal sintético prova a lógica (treino, exportação, paridade), nunca a detecção: não é medição nem simulação do
torno. ``gerar(pasta)`` grava o modelo treinado com ele (anomalia.onnx, classe.onnx, arvores.json, metadados.json)
e ``paridade.json``: 500 vetores e as saídas do onnxruntime para eles, que a API compara com as dela.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import exportar, nucleo

PONTOS = ("A", "B", "C")
MEDIDAS = ("rms_g", "pico_g", "curtose", "o1x", "o2x", "o3x", "vel_rms_mm_s")
NOMES = [f"z_{p}_{m}" for p in PONTOS for m in MEDIDAS] + ["log_rms_b_a", "log_rms_c_a", "marcha_rpm", "etapa_t3"]

# Deslocamento médio de z por classe (sintético): cada classe mexe em medidas diferentes
DESVIO = {
    "normal": {},
    "avanco_excessivo": {"z_B_rms_g": 4.0, "z_B_vel_rms_mm_s": 3.0, "z_B_o1x": 2.0},
    "rotacao_inadequada": {"z_B_o3x": 4.0, "z_A_rms_g": 2.0, "z_C_rms_g": 3.0},
    "ferramenta_desgastada": {"z_B_curtose": 4.0, "z_B_pico_g": 3.5},
    "desbalanceamento": {"z_A_o1x": 4.0, "z_C_o1x": 3.0},
}


def resumo_sintetico():
    return {
        "maquina_id": 1, "simulado": True, "versao_vetor": "v1", "referencia_numero": 1, "referencia_versao_id": 1,
        "caracteristicas": list(NOMES), "canais": [], "classes": list(nucleo.CLASSES), "total_candidatas": 0,
        "z_atencao": 3.0,
        "modelo": {"if_percentil": 99.0, "arvores_if": 50, "arvores_rf": 30, "profundidade_max_rf": 8,
                   "semente": 42},
        "treino": {"min_ensaios_por_classe": 2, "k_max": 5},
    }


def linhas_sinteticas(semente=7, ensaios_por_classe=3, janelas=30, classes=nucleo.CLASSES, dias=("2026-11-18",
                                                                                                  "2026-11-19")):
    """Janelas no formato LinhaConjunto: cada ensaio com uma intensidade sorteada (classes se sobrepõem)."""
    rng = np.random.default_rng(semente)
    linhas, janela_id, ensaio_id = [], 1, 1
    for classe in classes:
        for e in range(ensaios_por_classe):
            forca = rng.uniform(0.4, 1.0)
            dia = dias[e % len(dias)]
            for _ in range(janelas):
                v = {n: rng.normal(0.0, 1.0) for n in NOMES[:21]}
                for n, d in DESVIO[classe].items():
                    v[n] += d * forca
                v["log_rms_b_a"] = rng.normal(0.4, 0.1) + (0.3 * forca if classe == "avanco_excessivo" else 0)
                v["log_rms_c_a"] = rng.normal(-0.9, 0.1)
                v["marcha_rpm"] = 1120.0
                v["etapa_t3"] = 1.0
                valores = [float(np.float32(v[n])) for n in NOMES]
                linhas.append({"janela_id": janela_id, "medido_em": f"{dia}T12:00:00Z", "dia": dia, "rotulo": classe,
                               "origem": "ensaio", "ensaio_id": ensaio_id, "grupo": f"ensaio-{ensaio_id}",
                               "valores": valores, "motivo_exclusao": None})
                janela_id += 1
            ensaio_id += 1
    return linhas


def gerar(pasta):
    """Modelo de fixture + paridade (500 vetores) para os testes da API."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    resumo = resumo_sintetico()
    resultado = nucleo.treinar(NOMES, linhas_sinteticas(), nucleo.Parametros.do_resumo(resumo))
    arquivos = exportar.pacote(resultado, resumo, simulado=True)
    for nome, dados in arquivos.items():
        (pasta / nome).write_bytes(dados)
    teste = linhas_sinteticas(semente=99, ensaios_por_classe=2, janelas=50)
    X = np.array([l["valores"] for l in teste], dtype=np.float32)
    escore, probas = exportar.avaliar_onnx(arquivos, X, float(resultado.isolation.offset_))
    paridade = {
        "nota": "Vetores SINTÉTICOS (prova de lógica, não medição) e as saídas do onnxruntime para eles.",
        "caracteristicas": list(resultado.nomes),
        "classes": list(resultado.classes),
        "entradas": X.astype(np.float64).tolist(),
        "escore": escore.tolist(),
        "probabilidades": probas.tolist() if probas is not None else None,
    }
    (pasta / "paridade.json").write_text(json.dumps(paridade), encoding="utf-8")
    return arquivos
