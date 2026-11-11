"""Simulador de telemetria do PredictSpin.

ATENÇÃO: TODOS OS DADOS GERADOS AQUI SÃO SIMULADOS. Eles servem para exercitar a API, o painel e
o treino do classificador enquanto a bancada não está disponível. NUNCA substituem medição: nenhum
número saído deste arquivo pode ser apresentado como resultado do torno. O simulador envia como o
dispositivo "ps-sim-01", que a API marca como simulado; os ensaios que ele abre também ficam
marcados como simulados e podem ser separados em qualquer consulta com simulado=true|false.

Uso contínuo (uma janela a cada N segundos, até Ctrl+C):
    python simulador.py continuo --modo normal --intervalo 5 --rotacao 1200
Como o firmware, obedece ao modo rápido: se a resposta da API trouxer "modo_rapido_ate" no futuro,
passa a janelas de 1 s com "modo": "rapido" até esse instante e volta sozinho ao intervalo normal.
Toda janela leva "modo", "amostras" e "amostras_esperadas" (1600 amostras/s x duração da janela).

Uso roteiro (abre um ensaio para cada combinação de etapa, condição e rotação, envia M janelas
com medido_em espaçado de 5 s, encerra e passa ao próximo):
    python simulador.py roteiro --janelas 12 --rotacoes 400,800,1200

Configuração por variável de ambiente (ou pelo argumento entre parênteses):
    PREDICTSPIN_URL        endereço da API                      (--url)
    DISPOSITIVO_SIM_CHAVE  chave do dispositivo ps-sim-01       (--chave)
    ADMIN_EMAIL            e-mail do ADMIN, só no roteiro       (--email)
    ADMIN_SENHA            senha do ADMIN, só no roteiro        (--senha)
Se existir um arquivo .env na raiz do repositório, ele é lido para completar o que faltar.

Modelo usado (simplificado, só para ter dados com forma plausível):
  - a ordem 1X (desbalanceamento) cresce com o quadrado da rotação; 2X e 3X acompanham a 1X;
  - o ponto A (acionamento) sente a máquina, o ponto B (ferramenta) soma o esforço de corte e o
    ponto C (estrutura) recebe uma parte dos dois;
  - etapa: T0 máquina desligada (só ruído de fundo), T1 girando em vazio, T2 ferramenta se
    aproximando da peça sem contato (vibração próxima da de T1), T3 corte. Só em T3 há esforço
    de corte, e só nele a condição muda o sinal;
  - todo valor leva ruído multiplicativo; com --semente a sequência é reproduzível.
"""
import argparse
import itertools
import math
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

DISPOSITIVO_PADRAO = "ps-sim-01"
MAQUINA_PADRAO = "TORNO-01"
URL_PADRAO = "http://localhost:8080"

ETAPAS = ("T0", "T1", "T2", "T3")
CONDICOES = ("normal", "ferramenta_desgastada", "avanco_excessivo", "rotacao_inadequada")
MODOS = ("normal", "atencao", "severo")
PONTOS = ("A", "B", "C")
CANAIS = ("temp_cabecote_c", "temp_ferramenta_c", "amb_temp_c", "amb_umid_pct", "corrente_a")

INTERVALO_JANELAS_S = 5
JANELA_RAPIDA_S = 1
TAXA_AMOSTRAS_HZ = 1600  # ADXL345 a 1600 Hz, como o firmware
FUNDO_ESCALA_G = 16.0  # ADXL345 em +/-16 g
RUIDO_FUNDO_G = 0.004

# O que é cada etapa do protocolo de ensaios
DESCRICAO_ETAPA = {
    "T0": "máquina desligada",
    "T1": "girando em vazio",
    "T2": "ferramenta se aproximando da peça, sem contato",
    "T3": "corte",
}

# Quanto do esforço de corte existe em cada etapa (0 = sem corte). Em T2 a ferramenta ainda não
# toca a peça: o modelo é o mesmo de T1 e as duas etapas só diferem pelo ruído.
CARGA_DE_CORTE = {"T0": 0.0, "T1": 0.0, "T2": 0.0, "T3": 1.0}

# Corrente lida sem o motor girar (A): máquina desligada (T0) e eixo parado com o painel ligado
CORRENTE_DESLIGADA_A = 0.03
CORRENTE_PAINEL_A = 0.4

# Estado geral da máquina no uso contínuo: multiplica a vibração do acionamento
SEVERIDADE = {"normal": 1.0, "atencao": 1.8, "severo": 3.2}
RAZAO_2X = {"normal": 0.30, "atencao": 0.45, "severo": 0.60}
RAZAO_3X = {"normal": 0.12, "atencao": 0.20, "severo": 0.35}
CURTOSE_EXTRA_MODO = {"normal": 0.0, "atencao": 0.6, "severo": 1.8}
CHANCE_IMPACTO_SEVERO = 0.04

# Efeito de cada condição sobre a parcela de corte, medida no ponto B (ferramenta):
# fatores de 1X, 2X, 3X e banda larga; acréscimo de curtose; ganho na estrutura (ponto C);
# fatores de temperatura da ferramenta e de corrente.
EFEITO_CONDICAO = {
    "normal":                {"o1x": 1.0, "o2x": 1.0, "o3x": 1.0, "banda": 1.0, "curtose": 0.0,
                              "estrutura": 1.00, "temp": 1.00, "corrente": 1.0},
    "ferramenta_desgastada": {"o1x": 1.3, "o2x": 1.6, "o3x": 1.8, "banda": 2.2, "curtose": 1.6,
                              "estrutura": 1.15, "temp": 1.50, "corrente": 1.2},
    "avanco_excessivo":      {"o1x": 1.9, "o2x": 1.4, "o3x": 1.2, "banda": 1.7, "curtose": 0.5,
                              "estrutura": 1.25, "temp": 1.35, "corrente": 1.5},
    "rotacao_inadequada":    {"o1x": 1.2, "o2x": 1.5, "o3x": 2.6, "banda": 1.5, "curtose": 0.9,
                              "estrutura": 1.70, "temp": 1.20, "corrente": 1.1},
}


# --------------------------------------------------------------------------------------------
# Gerador de payload (sem rede): é o que os testes cobrem
# --------------------------------------------------------------------------------------------

def formatar_instante(instante):
    """Instante em UTC no formato ISO-8601 com Z, como o contrato pede."""
    if instante.tzinfo is None:
        instante = instante.replace(tzinfo=timezone.utc)
    instante = instante.astimezone(timezone.utc)
    fracao = "milliseconds" if instante.microsecond else "seconds"
    return instante.isoformat(timespec=fracao).replace("+00:00", "Z")


def _ruido(rng, desvio=0.07):
    """Fator multiplicativo em torno de 1, nunca negativo."""
    return max(0.2, rng.gauss(1.0, desvio))


def _medida(rng, o1x, o2x, o3x, banda, curtose_extra):
    """Monta as seis características de um ponto a partir das amplitudes (em g)."""
    o1x *= _ruido(rng)
    o2x *= _ruido(rng)
    o3x *= _ruido(rng)
    banda *= _ruido(rng)
    fundo = RUIDO_FUNDO_G * _ruido(rng, 0.10)

    potencia_tonal = (o1x ** 2 + o2x ** 2 + o3x ** 2) / 2.0
    potencia_total = potencia_tonal + banda ** 2 + fundo ** 2
    rms = math.sqrt(potencia_total)

    # Sinal dominado por senoides tem curtose perto de 1,5; ruído gaussiano, 3; impactos, acima.
    curtose = 3.0 - 1.5 * (potencia_tonal / potencia_total) + curtose_extra + rng.gauss(0.0, 0.12)
    curtose = max(1.2, curtose)

    fator_crista = min(8.0, max(1.414, 1.414 + (curtose - 1.5) * 1.45))
    pico = min(FUNDO_ESCALA_G, max(rms, rms * fator_crista * _ruido(rng, 0.05)))

    return {
        "rms_g": round(rms, 5),
        "pico_g": round(pico, 5),
        "curtose": round(curtose, 4),
        "o1x": round(o1x, 5),
        "o2x": round(o2x, 5),
        "o3x": round(o3x, 5),
    }


def gerar_payload(dispositivo, medido_em, rotacao_alvo_rpm, etapa="T3", condicao="normal", modo="normal",
                  rng=None, com_canais=True, rapido=False, duracao_s=INTERVALO_JANELAS_S):
    """Gera uma janela SIMULADA no contrato de POST /api/v1/telemetria (ver docs/payload.md).

    dispositivo        identificador que vai no corpo (tem de ser o mesmo do cabeçalho)
    medido_em          datetime da medição (UTC)
    rotacao_alvo_rpm   rotação pretendida; a rotação "medida" sai um pouco abaixo e com ruído
    etapa              T0 desligada, T1 em vazio, T2 aproximação sem contato, T3 corte
    condicao           rótulo do ensaio; só altera o sinal quando há corte (T3)
    modo               estado geral da máquina: normal, atencao ou severo
    rng                random.Random; passe um com semente fixa para repetir a sequência
    rapido             janela do modo rápido (campo "modo" = "rapido")
    duracao_s          duração da janela, que define "amostras_esperadas" (1600 por segundo)
    """
    if etapa not in ETAPAS:
        raise ValueError(f"etapa inválida: {etapa!r}. Use uma de {ETAPAS}")
    if condicao not in CONDICOES:
        raise ValueError(f"condição inválida: {condicao!r}. Use uma de {CONDICOES}")
    if modo not in MODOS:
        raise ValueError(f"modo inválido: {modo!r}. Use um de {MODOS}")
    if rotacao_alvo_rpm < 0 or rotacao_alvo_rpm > 30000:
        raise ValueError("rotação alvo fora da faixa de 0 a 30000 rpm")
    rng = rng or random.Random()

    girando = etapa != "T0" and rotacao_alvo_rpm > 0
    carga = CARGA_DE_CORTE[etapa] if girando else 0.0
    efeito = EFEITO_CONDICAO[condicao]
    severidade = SEVERIDADE[modo]

    if girando:
        escorregamento = 0.004 + 0.012 * carga
        rotacao = rotacao_alvo_rpm * (1.0 - escorregamento) * max(0.9, rng.gauss(1.0, 0.003))
    else:
        rotacao = 0.0
    r = rotacao / 1000.0

    # Ponto A, acionamento: desbalanceamento (1X) cresce com o quadrado da rotação
    a_o1x = 0.040 * r ** 2 * severidade
    a_o2x = a_o1x * RAZAO_2X[modo]
    a_o3x = a_o1x * RAZAO_3X[modo]
    a_banda = 0.010 * r * severidade + 0.006 * carga * r

    # Ponto B, ferramenta: metade do que vem do acionamento mais o esforço de corte
    b_o1x = 0.5 * a_o1x + 0.030 * carga * r * efeito["o1x"]
    b_o2x = 0.5 * a_o2x + 0.015 * carga * r * efeito["o2x"]
    b_o3x = 0.5 * a_o3x + 0.010 * carga * r * efeito["o3x"]
    b_banda = 0.006 * r * severidade + 0.045 * carga * r * efeito["banda"]

    # Ponto C, estrutura: recebe parte dos dois; a condição pode excitar a estrutura
    ganho_c = efeito["estrutura"] if carga > 0 else 1.0
    c_o1x = (0.30 * a_o1x + 0.35 * b_o1x) * ganho_c
    c_o2x = (0.30 * a_o2x + 0.35 * b_o2x) * ganho_c
    c_o3x = (0.30 * a_o3x + 0.35 * b_o3x) * ganho_c
    c_banda = (0.30 * a_banda + 0.35 * b_banda) * ganho_c

    curtose_modo = CURTOSE_EXTRA_MODO[modo] if girando else 0.0
    curtose_corte = efeito["curtose"] * carga
    pontos = {
        "A": _medida(rng, a_o1x, a_o2x, a_o3x, a_banda, curtose_modo),
        "B": _medida(rng, b_o1x, b_o2x, b_o3x, b_banda, curtose_modo + curtose_corte),
        "C": _medida(rng, c_o1x, c_o2x, c_o3x, c_banda, curtose_modo + 0.4 * curtose_corte),
    }

    # No modo severo, de vez em quando um impacto leva o acelerômetro da ferramenta perto do fundo de escala
    if modo == "severo" and girando and rng.random() < CHANCE_IMPACTO_SEVERO:
        pontos["B"]["pico_g"] = round(min(FUNDO_ESCALA_G, rng.uniform(12.0, 17.0)), 5)
    saturou = any(p["pico_g"] >= FUNDO_ESCALA_G for p in pontos.values())

    payload = {
        "dispositivo": dispositivo,
        "medido_em": formatar_instante(medido_em),
        "rotacao_rpm": round(rotacao, 1),
        "saturou": saturou,
        "pontos": pontos,
    }
    if com_canais:
        ambiente = 24.0 + rng.gauss(0.0, 0.3)
        aquecimento = (6.0 + 14.0 * r) * (1.0 + 0.25 * (severidade - 1.0)) if girando else 0.0
        if girando:
            corrente = (2.2 + 1.1 * r + 3.0 * carga * efeito["corrente"] * (0.6 + 0.4 * r))
            corrente *= (1.0 + 0.05 * (severidade - 1.0)) * _ruido(rng, 0.03)
        elif etapa == "T0":
            corrente = CORRENTE_DESLIGADA_A * _ruido(rng, 0.10)  # só o ruído do sensor
        else:
            corrente = CORRENTE_PAINEL_A * _ruido(rng, 0.03)  # eixo parado, painel ligado
        payload["canais"] = {
            "temp_cabecote_c": round(ambiente + aquecimento + rng.gauss(0.0, 0.4), 2),
            "temp_ferramenta_c": round(ambiente + 45.0 * carga * r * efeito["temp"] + rng.gauss(0.0, 0.8), 2),
            "amb_temp_c": round(ambiente, 2),
            "amb_umid_pct": round(min(100.0, max(0.0, 55.0 + rng.gauss(0.0, 1.5))), 1),
            "corrente_a": round(corrente, 3),
        }
    # Como o firmware: amostras esperadas = taxa x duração; "amostras" é a menor contagem entre os
    # sensores, que no simulador perde de 0 a 2 amostras (relógio do sensor um pouco fora do nominal)
    esperadas = int(round(TAXA_AMOSTRAS_HZ * duracao_s))
    payload["modo"] = "rapido" if rapido else "normal"
    payload["amostras_esperadas"] = esperadas
    payload["amostras"] = esperadas - rng.randint(0, 2)
    return payload


def montar_roteiro(etapas=ETAPAS, condicoes=CONDICOES, rotacoes=(400, 800, 1200), repeticoes=1):
    """Lista de ensaios do roteiro: toda combinação de etapa, condição e rotação, por repetição."""
    return [
        {"etapa": etapa, "condicao": condicao, "rotacao_alvo_rpm": int(rotacao), "repeticao": repeticao}
        for repeticao in range(1, repeticoes + 1)
        for etapa, condicao, rotacao in itertools.product(etapas, condicoes, rotacoes)
    ]


def instantes(inicio, quantidade, intervalo_s=INTERVALO_JANELAS_S):
    """Os medido_em de um ensaio: quantidade instantes espaçados de intervalo_s segundos."""
    return [inicio + timedelta(seconds=i * intervalo_s) for i in range(quantidade)]


def duracao_roteiro(roteiro, janelas, intervalo_s=INTERVALO_JANELAS_S):
    """Tempo de medição que o roteiro representa (não é o tempo que o envio leva)."""
    return timedelta(seconds=len(roteiro) * janelas * intervalo_s)


# --------------------------------------------------------------------------------------------
# Cliente da API
# --------------------------------------------------------------------------------------------

class ErroApi(RuntimeError):
    """Resposta de erro da API, já com a mensagem padronizada."""


class Cliente:
    """Conversa com a API: o dispositivo envia por cabeçalho, o ADMIN abre e encerra ensaios por JWT."""

    TENTATIVAS = 3
    TIMEOUT_S = 20

    def __init__(self, url, dispositivo, chave, sessao=None):
        if sessao is None:
            import requests  # importado aqui para o gerador de payload não depender de rede
            sessao = requests.Session()
        self.url = url.rstrip("/")
        self.dispositivo = dispositivo
        self.chave = chave
        self.sessao = sessao
        self.token = None

    def _chamar(self, metodo, caminho, repetir=False, **kwargs):
        ultima_falha = None
        for tentativa in range(1, (self.TENTATIVAS if repetir else 1) + 1):
            try:
                resposta = self.sessao.request(metodo, self.url + caminho, timeout=self.TIMEOUT_S, **kwargs)
            except OSError as erro:  # requests.RequestException é subclasse de OSError
                ultima_falha = f"sem resposta de {self.url}: {erro}"
            else:
                if resposta.status_code < 500 or not repetir:
                    return resposta
                ultima_falha = f"HTTP {resposta.status_code} em {caminho}"
            if tentativa < self.TENTATIVAS and repetir:
                time.sleep(2 * tentativa)
        raise ErroApi(ultima_falha)

    @staticmethod
    def _exigir(resposta, *aceitos):
        if resposta.status_code in aceitos:
            return resposta.json() if resposta.content else None
        try:
            corpo = resposta.json()
            detalhe = corpo.get("mensagem") or corpo
        except ValueError:
            detalhe = resposta.text[:200]
        raise ErroApi(f"HTTP {resposta.status_code}: {detalhe}")

    def _jwt(self):
        if not self.token:
            raise ErroApi("faça login antes (entrar)")
        return {"Authorization": "Bearer " + self.token}

    def enviar(self, payload):
        """Envia uma janela. Repetir é seguro: a API é idempotente por (dispositivo, medido_em)."""
        cabecalhos = {"X-Dispositivo-Id": self.dispositivo, "X-Dispositivo-Chave": self.chave}
        resposta = self._chamar("POST", "/api/v1/telemetria", repetir=True, json=payload, headers=cabecalhos)
        return self._exigir(resposta, 200, 201)

    def entrar(self, email, senha):
        resposta = self._chamar("POST", "/api/v1/auth/login", json={"email": email, "senha": senha})
        self.token = self._exigir(resposta, 200)["token"]

    def id_da_maquina(self, codigo):
        resposta = self._chamar("GET", "/api/v1/maquinas", params={"size": 200}, headers=self._jwt())
        for maquina in self._exigir(resposta, 200)["conteudo"]:
            if maquina["codigo"] == codigo:
                return maquina["id"]
        raise ErroApi(f"máquina {codigo} não encontrada na API")

    def abrir_ensaio(self, maquina_id, dados):
        resposta = self._chamar("POST", f"/api/v1/maquinas/{maquina_id}/ensaios", json=dados, headers=self._jwt())
        return self._exigir(resposta, 201)

    def encerrar_ensaio(self, ensaio_id):
        resposta = self._chamar("POST", f"/api/v1/ensaios/{ensaio_id}/encerrar", headers=self._jwt())
        return self._exigir(resposta, 200)

    def descartar_ensaio(self, ensaio_id):
        resposta = self._chamar("POST", f"/api/v1/ensaios/{ensaio_id}/descartar", headers=self._jwt())
        return self._exigir(resposta, 200)


# --------------------------------------------------------------------------------------------
# Os dois usos
# --------------------------------------------------------------------------------------------

def ler_instante(texto):
    """Instante ISO-8601 da API (com Z ou fuso) como datetime em UTC; None se ausente ou inválido."""
    if not texto:
        return None
    try:
        instante = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    return instante if instante.tzinfo else instante.replace(tzinfo=timezone.utc)


def executar_continuo(cliente, rng, modo, rotacao, etapa, condicao, intervalo_s, quantidade=None,
                      agora=lambda: datetime.now(timezone.utc), dormir=time.sleep, escrever=print):
    """Envia uma janela simulada a cada intervalo_s segundos, até quantidade (ou para sempre).

    Obedece ao modo rápido como o firmware: com "modo_rapido_ate" no futuro na resposta, a janela
    seguinte é de 1 s ("modo": "rapido"); quando o prazo passa, ou quando a resposta deixa de trazer
    o campo, volta ao intervalo normal.
    """
    enviadas = 0
    rapido_ate = None
    estava_rapido = False
    while quantidade is None or enviadas < quantidade:
        inicio = agora()
        rapido = rapido_ate is not None and inicio < rapido_ate
        if rapido != estava_rapido:
            escrever(f"[simulado] modo rápido até {formatar_instante(rapido_ate)}: janelas de {JANELA_RAPIDA_S} s"
                     if rapido else f"[simulado] modo rápido terminou: janelas de {intervalo_s:g} s")
            estava_rapido = rapido
        duracao = JANELA_RAPIDA_S if rapido else intervalo_s
        payload = gerar_payload(cliente.dispositivo, inicio, rotacao, etapa, condicao, modo, rng,
                                rapido=rapido, duracao_s=duracao)
        resposta = cliente.enviar(payload)
        rapido_ate = ler_instante(resposta.get("modo_rapido_ate"))
        enviadas += 1
        escrever(f"[simulado] janela {resposta['janela_id']} em {payload['medido_em']}  {payload['modo']:<6}  "
                 f"{payload['rotacao_rpm']:.0f} rpm  rms A/B/C = "
                 + " / ".join(f"{payload['pontos'][p]['rms_g']:.3f}" for p in PONTOS)
                 + (f"  ensaio {resposta['ensaio_id']}" if resposta.get("ensaio_id") else ""))
        if quantidade is None or enviadas < quantidade:
            dormir(duracao)
    return enviadas


def executar_roteiro(cliente, rng, maquina_id, roteiro, janelas, inicio, material=None, escrever=print):
    """Para cada item do roteiro: abre o ensaio, envia as janelas, encerra. Devolve o total enviado.

    Os medido_em avançam 5 s por janela a partir de inicio, sem esperar o tempo real passar.
    Se a API disser que uma janela já existia, o período escolhido cruza com um envio anterior:
    o ensaio é descartado e o roteiro para, para não deixar ensaio vazio contando como válido.
    """
    relogio = inicio
    total = 0
    for numero, item in enumerate(roteiro, start=1):
        pedido = dict(item)
        pedido["simulado"] = True
        pedido["observacao"] = "Dados simulados por analise/simulador.py; não é medição."
        if material:
            pedido["material"] = material
        ensaio = cliente.abrir_ensaio(maquina_id, pedido)
        try:
            for medido_em in instantes(relogio, janelas):
                payload = gerar_payload(cliente.dispositivo, medido_em, item["rotacao_alvo_rpm"],
                                        item["etapa"], item["condicao"], "normal", rng)
                resposta = cliente.enviar(payload)
                if resposta.get("duplicada"):
                    raise ErroApi(f"a janela de {payload['medido_em']} já existia: este período cruza com um "
                                  "envio anterior. Rode de novo com outro --inicio.")
                total += 1
        except BaseException:
            try:
                cliente.descartar_ensaio(ensaio["id"])
                escrever(f"[simulado] ensaio {ensaio['codigo']} descartado por causa da falha")
            except ErroApi as erro:
                escrever(f"[simulado] não consegui descartar o ensaio {ensaio['codigo']}: {erro}")
            raise
        cliente.encerrar_ensaio(ensaio["id"])
        relogio += timedelta(seconds=janelas * INTERVALO_JANELAS_S)
        escrever(f"[simulado] {numero}/{len(roteiro)}  {ensaio['codigo']}  {item['etapa']}  "
                 f"{item['condicao']}  {item['rotacao_alvo_rpm']} rpm  rep. {item['repeticao']}  "
                 f"{janelas} janelas")
    return total


# --------------------------------------------------------------------------------------------
# Linha de comando
# --------------------------------------------------------------------------------------------

def carregar_env(caminho):
    """Lê CHAVE=valor de um arquivo .env sem sobrescrever o que já está no ambiente."""
    if not caminho.is_file():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def _lista(texto):
    return [item.strip() for item in texto.split(",") if item.strip()]


def _instante(texto):
    instante = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    return instante if instante.tzinfo else instante.replace(tzinfo=timezone.utc)


def criar_argumentos():
    comum = argparse.ArgumentParser(add_help=False)
    comum.add_argument("--url", default=os.environ.get("PREDICTSPIN_URL", URL_PADRAO),
                       help="endereço da API (padrão: PREDICTSPIN_URL ou %s)" % URL_PADRAO)
    comum.add_argument("--dispositivo", default=DISPOSITIVO_PADRAO)
    comum.add_argument("--chave", default=os.environ.get("DISPOSITIVO_SIM_CHAVE"),
                       help="chave do dispositivo simulado (padrão: DISPOSITIVO_SIM_CHAVE)")
    comum.add_argument("--semente", type=int, help="semente fixa para repetir a mesma sequência")

    p = argparse.ArgumentParser(
        description="Simulador de telemetria do PredictSpin. Os dados são SIMULADOS e nunca substituem medição.")
    usos = p.add_subparsers(dest="uso", required=True)

    c = usos.add_parser("continuo", parents=[comum], help="uma janela a cada N segundos")
    c.add_argument("--modo", choices=MODOS, default="normal")
    c.add_argument("--intervalo", type=float, default=float(INTERVALO_JANELAS_S), help="segundos entre janelas")
    c.add_argument("--rotacao", type=int, default=1200, help="rotação alvo em rpm")
    c.add_argument("--etapa", choices=ETAPAS, default="T3",
                   help="; ".join(f"{e} {d}" for e, d in DESCRICAO_ETAPA.items()) + " (padrão: T3)")
    c.add_argument("--condicao", choices=CONDICOES, default="normal")
    c.add_argument("--quantidade", type=int, help="para depois de N janelas (padrão: até Ctrl+C)")

    r = usos.add_parser("roteiro", parents=[comum], help="ensaios rotulados para cada combinação")
    r.add_argument("--email", default=os.environ.get("ADMIN_EMAIL"), help="padrão: ADMIN_EMAIL")
    r.add_argument("--senha", default=os.environ.get("ADMIN_SENHA"), help="padrão: ADMIN_SENHA")
    r.add_argument("--maquina", default=MAQUINA_PADRAO, help="código da máquina")
    r.add_argument("--janelas", type=int, default=12, help="janelas por ensaio (M)")
    r.add_argument("--etapas", type=_lista, default=list(ETAPAS), help="ex.: T1,T3")
    r.add_argument("--condicoes", type=_lista, default=list(CONDICOES))
    r.add_argument("--rotacoes", type=_lista, default=["400", "800", "1200"], help="ex.: 400,800,1200")
    r.add_argument("--repeticoes", type=int, default=1)
    r.add_argument("--material", default=None)
    r.add_argument("--inicio", type=_instante,
                   help="medido_em da primeira janela (ISO-8601). Padrão: agora menos a duração do roteiro")
    return p


def main(argv=None):
    carregar_env(Path(__file__).resolve().parent.parent / ".env")
    a = criar_argumentos().parse_args(argv)
    if not a.chave:
        raise SystemExit("Falta a chave do dispositivo: defina DISPOSITIVO_SIM_CHAVE ou use --chave.")

    print("=" * 78)
    print("DADOS SIMULADOS: servem para testar a plataforma e nunca substituem medição.")
    print(f"API: {a.url}   dispositivo: {a.dispositivo}"
          + (f"   semente: {a.semente}" if a.semente is not None else ""))
    print("=" * 78)

    rng = random.Random(a.semente)
    cliente = Cliente(a.url, a.dispositivo, a.chave)
    try:
        if a.uso == "continuo":
            total = executar_continuo(cliente, rng, a.modo, a.rotacao, a.etapa, a.condicao, a.intervalo,
                                      a.quantidade)
        else:
            if not a.email or not a.senha:
                raise SystemExit("O roteiro entra como ADMIN: defina ADMIN_EMAIL e ADMIN_SENHA "
                                 "(ou use --email e --senha).")
            for etapa in a.etapas:
                if etapa not in ETAPAS:
                    raise SystemExit(f"Etapa inválida: {etapa}. Use {', '.join(ETAPAS)}.")
            for condicao in a.condicoes:
                if condicao not in CONDICOES:
                    raise SystemExit(f"Condição inválida: {condicao}. Use {', '.join(CONDICOES)}.")
            roteiro = montar_roteiro(a.etapas, a.condicoes, [int(x) for x in a.rotacoes], a.repeticoes)
            duracao = duracao_roteiro(roteiro, a.janelas)
            inicio = a.inicio or (datetime.now(timezone.utc).replace(microsecond=0) - duracao)
            print(f"Roteiro: {len(roteiro)} ensaios x {a.janelas} janelas, medido_em de "
                  f"{formatar_instante(inicio)} a {formatar_instante(inicio + duracao)}")
            cliente.entrar(a.email, a.senha)
            maquina_id = cliente.id_da_maquina(a.maquina)
            total = executar_roteiro(cliente, rng, maquina_id, roteiro, a.janelas, inicio, a.material)
    except KeyboardInterrupt:
        print("\nInterrompido.")
        return 130
    except ErroApi as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    print(f"Fim: {total} janelas simuladas enviadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
