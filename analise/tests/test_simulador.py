"""Testes do gerador de payload do simulador. Não usam rede."""
import json
import random
import re
from datetime import datetime, timedelta, timezone
from statistics import mean

import pytest

import simulador as sim

INICIO = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
CAMPOS_PONTO = {"rms_g", "pico_g", "curtose", "o1x", "o2x", "o3x"}


def gerar(semente=1, **kwargs):
    parametros = {"dispositivo": "ps-sim-01", "medido_em": INICIO, "rotacao_alvo_rpm": 1200}
    parametros.update(kwargs)
    return sim.gerar_payload(rng=random.Random(semente), **parametros)


def media_de(campo, ponto, rotacao=1200, n=200, **kwargs):
    rng = random.Random(7)
    return mean(sim.gerar_payload("ps-sim-01", INICIO, rotacao, rng=rng, **kwargs)["pontos"][ponto][campo]
                for _ in range(n))


# ---------------------------------------------------------------- contrato

def test_payload_segue_o_contrato_da_api():
    p = gerar()
    assert set(p) == {"dispositivo", "medido_em", "rotacao_rpm", "saturou", "pontos", "canais"}
    assert p["dispositivo"] == "ps-sim-01"
    assert p["medido_em"] == "2026-11-10T12:00:00Z"
    assert isinstance(p["saturou"], bool)
    assert set(p["pontos"]) == {"A", "B", "C"}
    for medida in p["pontos"].values():
        assert set(medida) == CAMPOS_PONTO
        assert all(isinstance(v, float) for v in medida.values())
    assert set(p["canais"]) == set(sim.CANAIS)
    json.dumps(p)  # tem de ser serializável como está


@pytest.mark.parametrize("etapa", sim.ETAPAS)
@pytest.mark.parametrize("condicao", sim.CONDICOES)
@pytest.mark.parametrize("modo", sim.MODOS)
def test_valores_ficam_dentro_dos_limites_que_a_api_valida(etapa, condicao, modo):
    rng = random.Random(3)
    for rotacao in (0, 400, 1200, 3000):
        for _ in range(30):
            p = sim.gerar_payload("ps-sim-01", INICIO, rotacao, etapa, condicao, modo, rng)
            assert 0 <= p["rotacao_rpm"] <= 30000
            for medida in p["pontos"].values():
                assert 0 <= medida["rms_g"] <= medida["pico_g"] <= sim.FUNDO_ESCALA_G
                assert min(medida["o1x"], medida["o2x"], medida["o3x"]) >= 0
                assert 1.0 < medida["curtose"] < 1_000_000
            assert 0 <= p["canais"]["amb_umid_pct"] <= 100
            assert p["canais"]["corrente_a"] >= 0
            assert p["saturou"] == any(m["pico_g"] >= sim.FUNDO_ESCALA_G for m in p["pontos"].values())


def test_canais_sao_opcionais():
    assert "canais" not in gerar(com_canais=False)


@pytest.mark.parametrize("argumentos", [
    {"etapa": "T9"},
    {"condicao": "quebrada"},
    {"modo": "critico"},
    {"rotacao_alvo_rpm": -1},
    {"rotacao_alvo_rpm": 30001},
])
def test_parametro_invalido_e_recusado(argumentos):
    with pytest.raises(ValueError):
        gerar(**argumentos)


def test_medido_em_sai_em_utc_com_z():
    assert sim.formatar_instante(datetime(2026, 11, 10, 9, 0, 5)) == "2026-11-10T09:00:05Z"
    brasilia = timezone(timedelta(hours=-3))
    assert sim.formatar_instante(datetime(2026, 11, 10, 9, 0, 5, tzinfo=brasilia)) == "2026-11-10T12:00:05Z"
    assert sim.formatar_instante(datetime(2026, 11, 10, 9, 0, 5, 250000, tzinfo=timezone.utc)) \
        == "2026-11-10T09:00:05.250Z"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z", gerar()["medido_em"])


# ---------------------------------------------------------------- semente

def test_mesma_semente_repete_o_payload():
    assert gerar(semente=42) == gerar(semente=42)
    assert gerar(semente=42) != gerar(semente=43)


def test_sem_semente_ainda_gera():
    p = sim.gerar_payload("ps-sim-01", INICIO, 800)
    assert p["pontos"]["A"]["rms_g"] > 0


# ---------------------------------------------------------------- plausibilidade

def test_rotacao_medida_fica_perto_e_abaixo_do_alvo():
    for alvo in (400, 800, 1200, 2000):
        medidas = [gerar(semente=s, rotacao_alvo_rpm=alvo)["rotacao_rpm"] for s in range(50)]
        assert 0.96 * alvo < mean(medidas) < alvo


def test_ordem_1x_cresce_com_a_rotacao():
    em_400 = media_de("o1x", "A", rotacao=400)
    em_800 = media_de("o1x", "A", rotacao=800)
    em_1600 = media_de("o1x", "A", rotacao=1600)
    assert em_400 < em_800 < em_1600
    # desbalanceamento: dobrar a rotação quadruplica a 1X (com folga para o ruído)
    assert 3.4 < em_800 / em_400 < 4.6
    assert 3.4 < em_1600 / em_800 < 4.6


def test_ordens_2x_e_3x_acompanham_a_1x_no_acionamento():
    o1x = media_de("o1x", "A")
    assert media_de("o2x", "A") == pytest.approx(o1x * sim.RAZAO_2X["normal"], rel=0.08)
    assert media_de("o3x", "A") == pytest.approx(o1x * sim.RAZAO_3X["normal"], rel=0.08)


def test_maquina_parada_so_tem_ruido_de_fundo():
    p = gerar(etapa="T0")
    assert p["rotacao_rpm"] == 0
    assert p["saturou"] is False
    for medida in p["pontos"].values():
        assert medida["o1x"] == medida["o2x"] == medida["o3x"] == 0
        assert medida["rms_g"] < 3 * sim.RUIDO_FUNDO_G
    assert p["canais"]["corrente_a"] < 1.0
    # rotação alvo zero dá no mesmo, em qualquer etapa
    assert gerar(etapa="T2", rotacao_alvo_rpm=0)["rotacao_rpm"] == 0


def test_corte_aumenta_a_vibracao_na_ferramenta():
    vazio = media_de("rms_g", "B", etapa="T1")
    leve = media_de("rms_g", "B", etapa="T2")
    pleno = media_de("rms_g", "B", etapa="T3")
    assert vazio < leve < pleno


@pytest.mark.parametrize("condicao", [c for c in sim.CONDICOES if c != "normal"])
def test_condicao_aparece_na_ferramenta_e_quase_nao_no_acionamento(condicao):
    normal_b = media_de("rms_g", "B", etapa="T3")
    alterada_b = media_de("rms_g", "B", etapa="T3", condicao=condicao)
    normal_a = media_de("rms_g", "A", etapa="T3")
    alterada_a = media_de("rms_g", "A", etapa="T3", condicao=condicao)
    assert alterada_b > 1.2 * normal_b
    assert alterada_a == pytest.approx(normal_a, rel=0.05)


@pytest.mark.parametrize("condicao", [c for c in sim.CONDICOES if c != "normal"])
def test_sem_corte_a_condicao_nao_muda_o_sinal(condicao):
    assert media_de("rms_g", "B", etapa="T1", condicao=condicao) \
        == pytest.approx(media_de("rms_g", "B", etapa="T1"), rel=0.05)


def test_desgaste_eleva_a_curtose_na_ferramenta():
    assert media_de("curtose", "B", etapa="T3", condicao="ferramenta_desgastada") \
        > media_de("curtose", "B", etapa="T3") + 1.0


def test_rotacao_inadequada_excita_mais_a_estrutura_e_a_3x():
    assert media_de("rms_g", "C", etapa="T3", condicao="rotacao_inadequada") \
        > 1.5 * media_de("rms_g", "C", etapa="T3")
    assert media_de("o3x", "B", etapa="T3", condicao="rotacao_inadequada") \
        > 1.5 * media_de("o3x", "B", etapa="T3")


def test_modos_normal_atencao_severo_sao_crescentes():
    for ponto in sim.PONTOS:
        normal = media_de("rms_g", ponto)
        atencao = media_de("rms_g", ponto, modo="atencao")
        severo = media_de("rms_g", ponto, modo="severo")
        assert normal < atencao < severo
    assert media_de("curtose", "A", modo="severo") > media_de("curtose", "A") + 1.0


def test_so_o_modo_severo_satura_e_so_as_vezes():
    rng = random.Random(11)
    normais = [sim.gerar_payload("ps-sim-01", INICIO, 1200, modo="normal", rng=rng)["saturou"] for _ in range(500)]
    severos = [sim.gerar_payload("ps-sim-01", INICIO, 1200, modo="severo", rng=rng)["saturou"] for _ in range(2000)]
    assert not any(normais)
    assert 0 < sum(severos) < 0.05 * len(severos)


def test_canais_respondem_a_carga_e_a_condicao():
    def canal(nome, **kwargs):
        rng = random.Random(5)
        return mean(sim.gerar_payload("ps-sim-01", INICIO, 1200, rng=rng, **kwargs)["canais"][nome]
                    for _ in range(200))

    assert canal("corrente_a", etapa="T1") < canal("corrente_a", etapa="T3")
    assert canal("corrente_a", etapa="T3") < canal("corrente_a", etapa="T3", condicao="avanco_excessivo")
    assert canal("temp_ferramenta_c", etapa="T3") < canal("temp_ferramenta_c", etapa="T3",
                                                           condicao="ferramenta_desgastada")
    assert canal("temp_cabecote_c", etapa="T0") < canal("temp_cabecote_c", etapa="T1")
    assert 22 < canal("amb_temp_c") < 26


# ---------------------------------------------------------------- roteiro

def test_roteiro_cobre_toda_combinacao():
    roteiro = sim.montar_roteiro(rotacoes=(400, 800, 1200))
    assert len(roteiro) == len(sim.ETAPAS) * len(sim.CONDICOES) * 3
    combinacoes = {(i["etapa"], i["condicao"], i["rotacao_alvo_rpm"]) for i in roteiro}
    assert len(combinacoes) == len(roteiro)
    assert all(i["repeticao"] == 1 for i in roteiro)

    com_repeticao = sim.montar_roteiro(("T1",), ("normal",), (800,), repeticoes=3)
    assert [i["repeticao"] for i in com_repeticao] == [1, 2, 3]


def test_instantes_sao_espacados_de_cinco_segundos():
    lista = sim.instantes(INICIO, 4)
    assert lista[0] == INICIO
    assert [(b - a).total_seconds() for a, b in zip(lista, lista[1:])] == [5, 5, 5]
    assert sim.duracao_roteiro(sim.montar_roteiro(("T1",), ("normal",), (800, 1200)), janelas=12) \
        == timedelta(seconds=120)


class ClienteFalso:
    """Registra as chamadas no lugar da API."""

    dispositivo = "ps-sim-01"

    def __init__(self, duplicar_na=None):
        self.chamadas = []
        self.payloads = []
        self.duplicar_na = duplicar_na

    def abrir_ensaio(self, maquina_id, dados):
        self.chamadas.append(("abrir", maquina_id, dados))
        numero = sum(1 for c in self.chamadas if c[0] == "abrir")
        return {"id": numero, "codigo": f"TORNO-01-{dados['etapa']}-{numero:05d}"}

    def enviar(self, payload):
        self.payloads.append(payload)
        self.chamadas.append(("enviar", payload["medido_em"]))
        return {"janela_id": len(self.payloads), "duplicada": len(self.payloads) == self.duplicar_na,
                "ensaio_id": None}

    def encerrar_ensaio(self, ensaio_id):
        self.chamadas.append(("encerrar", ensaio_id))

    def descartar_ensaio(self, ensaio_id):
        self.chamadas.append(("descartar", ensaio_id))


def test_roteiro_abre_envia_e_encerra_cada_ensaio():
    cliente = ClienteFalso()
    roteiro = sim.montar_roteiro(("T1", "T2"), ("normal",), (800,))
    linhas = []

    total = sim.executar_roteiro(cliente, random.Random(1), 1, roteiro, 3, INICIO, "aço SAE 1045", linhas.append)

    assert total == 6
    assert [c[0] for c in cliente.chamadas] == ["abrir", "enviar", "enviar", "enviar", "encerrar"] * 2
    pedido = cliente.chamadas[0][2]
    assert pedido["simulado"] is True
    assert pedido["material"] == "aço SAE 1045"
    assert "simulad" in pedido["observacao"].lower()
    # medido_em segue de 5 em 5 s, sem repetir entre um ensaio e o seguinte
    assert [p["medido_em"] for p in cliente.payloads] == [
        sim.formatar_instante(INICIO + timedelta(seconds=5 * i)) for i in range(6)]
    assert len(linhas) == 2


def test_roteiro_descarta_o_ensaio_e_para_se_a_janela_ja_existia():
    cliente = ClienteFalso(duplicar_na=2)
    roteiro = sim.montar_roteiro(("T1", "T2"), ("normal",), (800,))

    with pytest.raises(sim.ErroApi, match="--inicio"):
        sim.executar_roteiro(cliente, random.Random(1), 1, roteiro, 3, INICIO, escrever=lambda _: None)

    assert [c[0] for c in cliente.chamadas] == ["abrir", "enviar", "enviar", "descartar"]


def test_continuo_envia_a_quantidade_pedida_e_espera_entre_janelas():
    cliente = ClienteFalso()
    esperas = []
    relogio = iter(sim.instantes(INICIO, 3))

    total = sim.executar_continuo(cliente, random.Random(1), "atencao", 1200, "T2", "normal", 5, quantidade=3,
                                  agora=lambda: next(relogio), dormir=esperas.append, escrever=lambda _: None)

    assert total == 3
    assert esperas == [5, 5]
    assert [p["dispositivo"] for p in cliente.payloads] == ["ps-sim-01"] * 3


# ---------------------------------------------------------------- cliente HTTP (sessão falsa)

class RespostaFalsa:
    def __init__(self, status, corpo):
        self.status_code = status
        self._corpo = corpo
        self.content = b"x" if corpo is not None else b""
        self.text = str(corpo)

    def json(self):
        return self._corpo


class SessaoFalsa:
    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.pedidos = []

    def request(self, metodo, url, **kwargs):
        self.pedidos.append((metodo, url, kwargs))
        return self.respostas.pop(0)


def test_cliente_envia_com_os_cabecalhos_do_dispositivo():
    sessao = SessaoFalsa([RespostaFalsa(201, {"janela_id": 9, "duplicada": False})])
    cliente = sim.Cliente("http://api.local/", "ps-sim-01", "segredo", sessao)

    assert cliente.enviar({"dispositivo": "ps-sim-01"})["janela_id"] == 9

    metodo, url, kwargs = sessao.pedidos[0]
    assert (metodo, url) == ("POST", "http://api.local/api/v1/telemetria")
    assert kwargs["headers"] == {"X-Dispositivo-Id": "ps-sim-01", "X-Dispositivo-Chave": "segredo"}


def test_cliente_mostra_a_mensagem_de_erro_da_api():
    sessao = SessaoFalsa([RespostaFalsa(401, {"mensagem": "Credencial de dispositivo inválida"})])
    cliente = sim.Cliente("http://api.local", "ps-sim-01", "errada", sessao)
    with pytest.raises(sim.ErroApi, match="401.*Credencial"):
        cliente.enviar({})


def test_cliente_entra_e_usa_o_token_para_achar_a_maquina():
    sessao = SessaoFalsa([
        RespostaFalsa(200, {"token": "abc"}),
        RespostaFalsa(200, {"conteudo": [{"id": 4, "codigo": "FRESA-02"}, {"id": 1, "codigo": "TORNO-01"}]}),
    ])
    cliente = sim.Cliente("http://api.local", "ps-sim-01", "segredo", sessao)

    with pytest.raises(sim.ErroApi):
        cliente.id_da_maquina("TORNO-01")  # sem login
    cliente.entrar("admin@x.com", "senha")
    assert cliente.id_da_maquina("TORNO-01") == 1
    assert sessao.pedidos[1][2]["headers"] == {"Authorization": "Bearer abc"}
