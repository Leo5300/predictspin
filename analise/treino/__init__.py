"""Treino dos modelos de segunda opinião do PredictSpin (Isolation Forest e Random Forest).

A inferência roda dentro da API Java (ONNX); este pacote só treina. Dois jeitos de rodar, a mesma função
(``executar``):
- linha de comando: ``python -m analise.treino --api URL --trabalho ID`` (ou ``--maquina-id`` para só treinar e
  gravar numa pasta);
- serviço HTTP pequeno (FastAPI, ``analise.treino.servico``), em Docker, chamado pelo botão Treinar da API.
"""

from __future__ import annotations

import os
from pathlib import Path

from . import exportar, nucleo
from .cliente import ClienteTreino, ErroApi
from .nucleo import ErroDeTreino, Parametros

__all__ = ["executar", "treinar_conjunto", "ClienteTreino", "ErroApi", "ErroDeTreino", "Parametros"]


def treinar_conjunto(resumo, linhas, simulado):
    """Conjunto (resumo + linhas da API) → arquivos do modelo (nome → bytes) e o resultado do treino."""
    parametros = Parametros.do_resumo(resumo)
    resultado = nucleo.treinar(resumo["caracteristicas"], linhas, parametros)
    return exportar.pacote(resultado, resumo, simulado), resultado


def executar(cliente, trabalho_id=None, maquina_id=None, simulado=None, saida=None, escrever=print):
    """Busca o conjunto, treina e devolve o modelo.

    Com ``trabalho_id``: marca o trabalho como executando, treina e envia o resultado à API (ou a falha). Sem ele:
    treina a máquina dada e grava os arquivos em ``saida``.
    """
    if trabalho_id is not None:
        trabalho = cliente.trabalho(trabalho_id)
        maquina_id, simulado = trabalho["maquina_id"], trabalho["simulado"]
        cliente.iniciar(trabalho_id)
    try:
        resumo = cliente.resumo(maquina_id, simulado)
        escrever(f"conjunto: {resumo['total_candidatas']} janelas rotuladas, vetor {resumo['versao_vetor']}, "
                 f"referência {resumo.get('referencia_numero')}" + ("  [DADO SIMULADO]" if simulado else ""))
        linhas = list(cliente.linhas(maquina_id, simulado))
        arquivos, resultado = treinar_conjunto(resumo, linhas, simulado)
        for aviso in resultado.avisos:
            escrever("aviso: " + aviso)
        escrever(f"treinado: {resultado.conjunto['janelas']} janelas, classes {resultado.classes or '(só anomalia)'}, "
                 f"limiar {resultado.limiar:.4f}")
    except Exception as erro:
        if trabalho_id is not None:
            try:
                cliente.falhar(trabalho_id, f"{type(erro).__name__}: {erro}")
            except ErroApi as e:
                escrever(f"não consegui avisar a falha: {e}")
        raise
    if saida is not None:
        pasta = Path(saida)
        pasta.mkdir(parents=True, exist_ok=True)
        for nome, dados in arquivos.items():
            (pasta / nome).write_bytes(dados)
        escrever(f"arquivos em {pasta}")
    if trabalho_id is not None:
        modelo = cliente.enviar_resultado(trabalho_id, arquivos)
        escrever(f"modelo versão {modelo.get('versao')} criado como candidato")
        return modelo
    return arquivos


def chave_do_ambiente():
    """TREINO_CHAVE do ambiente ou do .env da raiz (nunca impressa)."""
    if os.environ.get("TREINO_CHAVE"):
        return os.environ["TREINO_CHAVE"]
    env = Path(__file__).resolve().parents[2] / ".env"
    if env.is_file():
        for linha in env.read_text(encoding="utf-8").splitlines():
            if linha.strip().startswith("TREINO_CHAVE="):
                return linha.split("=", 1)[1].strip().strip('"').strip("'")
    return None
