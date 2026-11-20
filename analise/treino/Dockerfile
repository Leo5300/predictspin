# Serviço de treino do PredictSpin (FastAPI). Só treina: a inferência roda na API Java.
# Contexto do build: a pasta analise/ (docker compose --profile treino up -d --build).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY treino/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY treino/ /app/analise/treino/
RUN useradd --system --no-create-home treino
USER treino

# PS_API_URL: onde está a API; TREINO_CHAVE: segredo compartilhado com ela (variáveis do ambiente, nunca aqui)
ENV PORT=8090
EXPOSE 8090
CMD ["sh", "-c", "exec uvicorn analise.treino.servico:app --host 0.0.0.0 --port ${PORT}"]
