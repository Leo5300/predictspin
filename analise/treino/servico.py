"""Serviço HTTP do treino (FastAPI), para o botão Treinar da API.

    uvicorn analise.treino.servico:app --host 0.0.0.0 --port 8090

Variáveis: ``PS_API_URL`` (endereço da API, onde buscar o conjunto e entregar o modelo) e ``TREINO_CHAVE``
(segredo compartilhado com a API; nunca impresso). O serviço pode dormir: a API espera ``GET /saude`` responder.
"""

from __future__ import annotations

import hmac
import logging
import os
import threading

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import ClienteTreino, executar

log = logging.getLogger("predictspin.treino")
app = FastAPI(title="PredictSpin · treino", version="1")
_ocupado = threading.Lock()


class PedidoTreino(BaseModel):
    trabalho_id: int


def _chave():
    return os.environ.get("TREINO_CHAVE", "")


def _url_api():
    return os.environ.get("PS_API_URL", "http://localhost:8080")


@app.get("/saude")
def saude():
    return {"ok": True, "ocupado": _ocupado.locked()}


def _rodar(trabalho_id):
    try:
        executar(ClienteTreino(_url_api(), _chave()), trabalho_id=trabalho_id, escrever=log.info)
    except Exception:  # a falha já foi avisada à API por executar(); aqui só registra
        log.exception("treino %s falhou", trabalho_id)
    finally:
        _ocupado.release()


@app.post("/treinar", status_code=202)
def treinar(pedido: PedidoTreino, x_treino_chave: str = Header(default="")):
    chave = _chave()
    if not chave or not hmac.compare_digest(x_treino_chave.encode(), chave.encode()):
        raise HTTPException(status_code=401, detail="chave do serviço de treino ausente ou errada")
    if not _ocupado.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="já há um treino em andamento")
    threading.Thread(target=_rodar, args=(pedido.trabalho_id,), daemon=True).start()
    return {"trabalho_id": pedido.trabalho_id, "aceito": True}
