"""Conversa com a API do PredictSpin pelas rotas do serviço de treino (cabeçalho X-Treino-Chave)."""

from __future__ import annotations

import requests

PREFIXO = "/api/v1/treino/servico"
TAMANHO_PAGINA = 500


class ErroApi(RuntimeError):
    """Resposta de erro da API."""


class ClienteTreino:
    def __init__(self, url, chave, sessao=None, timeout_s=60):
        if not chave:
            raise ErroApi("falta a chave do serviço de treino: defina TREINO_CHAVE")
        self.url = url.rstrip("/")
        self.sessao = sessao or requests.Session()
        self.sessao.headers["X-Treino-Chave"] = chave
        self.timeout_s = timeout_s

    def _chamar(self, metodo, caminho, **kwargs):
        resposta = self.sessao.request(metodo, self.url + PREFIXO + caminho, timeout=self.timeout_s, **kwargs)
        if resposta.status_code >= 400:
            try:
                mensagem = resposta.json().get("mensagem", resposta.text)
            except ValueError:
                mensagem = resposta.text
            raise ErroApi(f"{metodo} {caminho}: {resposta.status_code} {mensagem}")
        return resposta.json() if resposta.content else None

    def trabalho(self, trabalho_id):
        return self._chamar("GET", f"/trabalhos/{trabalho_id}")

    def iniciar(self, trabalho_id):
        return self._chamar("POST", f"/trabalhos/{trabalho_id}/inicio")

    def falhar(self, trabalho_id, mensagem):
        return self._chamar("POST", f"/trabalhos/{trabalho_id}/falha", json={"mensagem": mensagem[:1000]})

    def resumo(self, maquina_id, simulado):
        return self._chamar("GET", "/conjunto/resumo", params={"maquina_id": maquina_id, "simulado": simulado})

    def linhas(self, maquina_id, simulado, tamanho=TAMANHO_PAGINA):
        """Todas as janelas rotuladas, página por página (a API calcula o vetor; nada fica preso na memória dela)."""
        pagina = 0
        while True:
            p = self._chamar("GET", "/conjunto", params={"maquina_id": maquina_id, "simulado": simulado,
                                                         "pagina": pagina, "tamanho": tamanho})
            yield from p["conteudo"]
            pagina += 1
            if pagina >= p["total_paginas"]:
                return

    def enviar_resultado(self, trabalho_id, arquivos):
        """Arquivos do modelo em multipart: anomalia, classe (se houver), arvores e metadados."""
        partes = {nome.split(".")[0]: (nome, dados, "application/octet-stream") for nome, dados in arquivos.items()}
        return self._chamar("POST", f"/trabalhos/{trabalho_id}/resultado", files=partes)
