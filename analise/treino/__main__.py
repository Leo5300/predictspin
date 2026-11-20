"""Linha de comando do treino.

    python -m analise.treino --api http://localhost:8080 --trabalho 12
    python -m analise.treino --api http://localhost:8080 --maquina-id 1 --simulado --saida modelo/
    python -m analise.treino fixture --saida api/src/test/resources/modelo-fixture

A chave do serviço de treino vem de TREINO_CHAVE (ambiente ou .env da raiz) e nunca é impressa.
"""

from __future__ import annotations

import argparse
import sys

from . import ClienteTreino, ErroApi, ErroDeTreino, chave_do_ambiente, executar


def criar_argumentos():
    p = argparse.ArgumentParser(prog="python -m analise.treino",
                                description="Treina os modelos de segunda opinião do PredictSpin.")
    p.add_argument("uso", nargs="?", choices=["treinar", "fixture"], default="treinar")
    p.add_argument("--api", default="http://localhost:8080", help="endereço da API")
    p.add_argument("--trabalho", type=int, help="trabalho de treino criado pelo botão Treinar")
    p.add_argument("--maquina-id", type=int, help="sem trabalho: máquina a treinar (grava só em --saida)")
    p.add_argument("--simulado", action="store_true", help="sem trabalho: treina com o dado simulado")
    p.add_argument("--saida", help="pasta onde gravar os arquivos do modelo")
    return p


def main(argv=None):
    a = criar_argumentos().parse_args(argv)
    if a.uso == "fixture":
        from .fixture import gerar
        gerar(a.saida or "modelo-fixture")
        return 0
    if a.trabalho is None and (a.maquina_id is None or a.saida is None):
        raise SystemExit("Use --trabalho ID, ou --maquina-id com --saida.")
    try:
        cliente = ClienteTreino(a.api, chave_do_ambiente())
        executar(cliente, trabalho_id=a.trabalho, maquina_id=a.maquina_id, simulado=a.simulado, saida=a.saida)
    except (ErroApi, ErroDeTreino) as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
