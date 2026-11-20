"""Treino dos modelos de segunda opinião. Os conjuntos aqui são SINTÉTICOS: provam a lógica, não a detecção."""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

import treino
from treino import exportar, fixture, nucleo, servico
from treino.nucleo import ErroDeTreino, Parametros

RESUMO = fixture.resumo_sintetico()
PARAM = Parametros.do_resumo(RESUMO)


@pytest.fixture(scope="module")
def treinado():
    linhas = fixture.linhas_sinteticas()
    resultado = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    return linhas, resultado, exportar.pacote(resultado, RESUMO, simulado=True)


def test_parametros_vem_do_resumo_da_api():
    assert PARAM.if_percentil == 99.0
    assert PARAM.arvores_if == 50 and PARAM.arvores_rf == 30 and PARAM.profundidade_max_rf == 8
    assert PARAM.min_ensaios_por_classe == 2 and PARAM.k_max == 5 and PARAM.semente == 42
    assert Parametros.do_resumo({}) == Parametros()


def test_janela_sem_vetor_so_entra_na_contagem_de_excluidas():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=1, janelas=3, classes=["normal"])
    linhas.append({**linhas[0], "janela_id": 99, "valores": None, "motivo_exclusao": "evento_marcado"})
    linhas.append({**linhas[0], "janela_id": 98, "valores": None, "motivo_exclusao": "evento_marcado"})
    conj = nucleo.Conjunto.das_linhas(fixture.NOMES, linhas)
    assert conj.X.shape == (3, 25)
    assert conj.excluidas == {"evento_marcado": 2}


def test_isolation_forest_treina_so_com_o_normal(monkeypatch):
    vistos = []
    original = nucleo._isolation

    def espiao(p, X):
        vistos.append(len(X))
        return original(p, X)

    monkeypatch.setattr(nucleo, "_isolation", espiao)
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=10)
    nucleo.treinar(fixture.NOMES, linhas, PARAM)
    normais = sum(1 for l in linhas if l["rotulo"] == "normal")
    # o modelo final usa todas as normais; os da validação, só parte delas (nunca as outras classes)
    assert vistos[-1] == normais
    assert all(n <= normais for n in vistos)


def test_limiar_eh_o_percentil_do_escore_no_normal(treinado):
    linhas, resultado, _ = treinado
    X = np.array([l["valores"] for l in linhas if l["rotulo"] == "normal"])
    escore = nucleo.escore_anomalia(resultado.isolation, X)
    assert resultado.limiar == pytest.approx(np.percentile(escore, 99))
    assert (escore > resultado.limiar).mean() <= 0.02


def test_metricas_por_ensaio_por_dia_e_comparacao_com_a_regra(treinado):
    _, resultado, _ = treinado
    m = resultado.metricas
    pe = m["por_ensaio"]
    assert pe["aplicavel"] and pe["k"] == 3  # 3 ensaios por classe
    c = pe["classificador"]
    assert set(c["recall"]) == set(nucleo.CLASSES)
    assert np.array(c["matriz_confusao"]).sum() == c["janelas"]
    assert 0 <= c["f1_macro"] <= 1
    for lado in ("regra", "isolation_forest"):
        taxas = pe["comparacao"][lado]
        assert taxas["janelas_normais"] + taxas["janelas_nao_normais"] == pe["janelas_testadas"]
        assert 0 <= taxas["falso_positivo"] <= 1 and 0 <= taxas["deteccao"] <= 1
    assert m["por_dia"]["aplicavel"] and m["por_dia"]["dias"] == 2
    assert len(resultado.importancia) == 10
    assert resultado.importancia[0]["valor"] >= resultado.importancia[-1]["valor"]
    assert set(resultado.pesos) == set(resultado.nomes)


def test_validacao_por_ensaio_nunca_separa_um_ensaio():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=3, janelas=5)
    conj = nucleo.Conjunto.das_linhas(fixture.NOMES, linhas)
    partes, k = nucleo._partes_por_ensaio(PARAM, conj.grupos, conj.y, list(nucleo.CLASSES))
    assert k == 3
    for treino_idx, teste_idx in partes:
        assert not set(conj.grupos[treino_idx]) & set(conj.grupos[teste_idx])


def test_um_dia_so_nao_tem_validacao_por_dia():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=8, dias=("2026-11-19",))
    r = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    assert r.metricas["por_dia"] == {"aplicavel": False, "motivo": "não aplicável (1 dia)"}


def test_classe_com_menos_de_2_ensaios_fica_fora_e_e_listada():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=8,
                                       classes=["normal", "avanco_excessivo", "desbalanceamento"])
    linhas += fixture.linhas_sinteticas(semente=3, ensaios_por_classe=1, janelas=8, classes=["ferramenta_desgastada"])
    for i, l in enumerate(linhas[-8:]):
        l["grupo"] = "ensaio-900"
    r = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    assert "ferramenta_desgastada" not in r.classes
    assert {"classe": "ferramenta_desgastada", "ensaios": 1} in r.classes_fora
    assert any("fora do classificador" in a for a in r.avisos)


def test_menos_de_2_classes_treina_so_o_isolation_forest():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=3, janelas=8, classes=["normal"])
    r = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    assert r.floresta is None and r.classes == []
    assert any("só o Isolation Forest" in a for a in r.avisos)
    arquivos = exportar.pacote(r, RESUMO, simulado=True)
    assert "classe.onnx" not in arquivos and "anomalia.onnx" in arquivos
    assert len(r.importancia) == 10  # importância pelo escore de anomalia


def test_sem_janela_normal_nao_treina():
    with pytest.raises(ErroDeTreino):
        nucleo.treinar(fixture.NOMES, fixture.linhas_sinteticas(classes=["avanco_excessivo"], janelas=5), PARAM)
    with pytest.raises(ErroDeTreino):
        nucleo.treinar(fixture.NOMES, [], PARAM)


def test_coluna_com_valor_ausente_sai_do_modelo():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=6, classes=["normal", "avanco_excessivo"])
    i = fixture.NOMES.index("z_A_vel_rms_mm_s")
    linhas[3]["valores"][i] = None
    r = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    assert "z_A_vel_rms_mm_s" in r.removidas and "z_A_vel_rms_mm_s" not in r.nomes
    assert len(r.nomes) == 24


def test_mesma_semente_mesmo_modelo():
    linhas = fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=6)
    a = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    b = nucleo.treinar(fixture.NOMES, linhas, PARAM)
    X = np.array([l["valores"] for l in linhas], dtype=np.float32)
    assert a.limiar == b.limiar
    assert np.array_equal(a.floresta.predict_proba(X), b.floresta.predict_proba(X))


def test_paridade_onnxruntime_e_scikit_learn_em_500_janelas(treinado):
    _, resultado, arquivos = treinado
    teste = fixture.linhas_sinteticas(semente=99, ensaios_por_classe=2, janelas=50)
    X = np.array([l["valores"] for l in teste], dtype=np.float32)
    assert len(X) == 500
    escore, probas = exportar.avaliar_onnx(arquivos, X, float(resultado.isolation.offset_))
    assert np.max(np.abs(escore - nucleo.escore_anomalia(resultado.isolation, X))) < 1e-5
    assert np.max(np.abs(probas - resultado.floresta.predict_proba(X))) < 1e-5


def _avaliar_arvore(a, x):
    no = 0
    while a["esquerda"][no] != -1:
        no = a["esquerda"][no] if np.float32(x[a["atributo"][no]]) <= a["limiar"][no] else a["direita"][no]
    return a["folha"][no]


def test_arvores_em_json_dao_o_mesmo_resultado_plano_b(treinado):
    _, resultado, arquivos = treinado
    arvores = json.loads(arquivos["arvores.json"])
    X = np.array([l["valores"] for l in fixture.linhas_sinteticas(semente=5, ensaios_por_classe=1, janelas=20)],
                 dtype=np.float32)
    iso = arvores["isolation_forest"]
    for x, esperado in zip(X, nucleo.escore_anomalia(resultado.isolation, X)):
        media = np.mean([_avaliar_arvore(a, x) for a in iso["arvores"]])
        assert 2 ** (-media / iso["c_max_amostras"]) == pytest.approx(esperado, abs=1e-5)
    rf = arvores["random_forest"]
    assert rf["classes"] == resultado.classes
    for x, esperado in zip(X, resultado.floresta.predict_proba(X)):
        media = np.mean([_avaliar_arvore(a, x) for a in rf["arvores"]], axis=0)
        assert np.max(np.abs(media - esperado)) < 1e-5


def test_metadados_e_tamanho(treinado):
    _, resultado, arquivos = treinado
    meta = json.loads(arquivos["metadados.json"])
    assert meta["versao_vetor"] == "v1" and meta["referencia_numero"] == 1
    assert meta["caracteristicas"] == fixture.NOMES
    assert meta["aviso_simulado"] == "dado simulado: não é resultado"
    assert meta["classes"] == resultado.classes
    assert meta["conjunto"]["por_origem"] == {"ensaio": 450}
    assert meta["offset_anomalia"] == pytest.approx(resultado.isolation.offset_)
    for nome in ("anomalia.onnx", "classe.onnx"):
        assert len(arquivos[nome]) < 5 * 1024 * 1024
        assert meta["tamanhos_bytes"][nome] == len(arquivos[nome])
    real = json.loads(exportar.pacote(resultado, RESUMO, simulado=False)["metadados.json"])
    assert real["aviso_simulado"] is None and real["simulado"] is False


class ClienteFalso:
    def __init__(self, falhar_no_resumo=False):
        self.chamadas = []
        self.falhar_no_resumo = falhar_no_resumo

    def trabalho(self, i):
        self.chamadas.append(("trabalho", i))
        return {"id": i, "maquina_id": 1, "simulado": True, "estado": "pendente"}

    def iniciar(self, i):
        self.chamadas.append(("iniciar", i))

    def falhar(self, i, mensagem):
        self.chamadas.append(("falhar", i, mensagem))

    def resumo(self, maquina_id, simulado):
        if self.falhar_no_resumo:
            raise treino.ErroApi("API fora do ar")
        return {**RESUMO, "total_candidatas": 90}

    def linhas(self, maquina_id, simulado):
        yield from fixture.linhas_sinteticas(ensaios_por_classe=2, janelas=8)

    def enviar_resultado(self, i, arquivos):
        self.chamadas.append(("resultado", i, sorted(arquivos)))
        return {"id": 5, "versao": 1}


def test_trabalho_marca_inicio_treina_e_envia(tmp_path):
    cliente = ClienteFalso()
    saida = []
    modelo = treino.executar(cliente, trabalho_id=12, saida=tmp_path, escrever=saida.append)
    assert modelo == {"id": 5, "versao": 1}
    assert cliente.chamadas[0] == ("trabalho", 12) and cliente.chamadas[1] == ("iniciar", 12)
    assert cliente.chamadas[-1] == ("resultado", 12, ["anomalia.onnx", "arvores.json", "classe.onnx",
                                                      "metadados.json"])
    assert (tmp_path / "anomalia.onnx").is_file()
    assert any("DADO SIMULADO" in s for s in saida)


def test_falha_no_treino_e_avisada_a_api():
    cliente = ClienteFalso(falhar_no_resumo=True)
    with pytest.raises(treino.ErroApi):
        treino.executar(cliente, trabalho_id=3, escrever=lambda s: None)
    assert cliente.chamadas[-1][0] == "falhar" and "API fora do ar" in cliente.chamadas[-1][2]


def test_cliente_manda_a_chave_e_pagina(monkeypatch):
    pedidos = []

    class Resposta:
        def __init__(self, corpo):
            self.status_code, self._corpo, self.content = 200, corpo, b"x"

        def json(self):
            return self._corpo

    class Sessao:
        headers = {}

        def request(self, metodo, url, **kw):
            pedidos.append((metodo, url, kw.get("params")))
            pagina = (kw.get("params") or {}).get("pagina", 0)
            return Resposta({"conteudo": [{"janela_id": pagina}], "total_paginas": 2})

    cliente = treino.ClienteTreino("http://api/", "segredo", sessao=Sessao())
    assert [l["janela_id"] for l in cliente.linhas(1, True)] == [0, 1]
    assert Sessao.headers["X-Treino-Chave"] == "segredo"
    assert pedidos[0][1] == "http://api/api/v1/treino/servico/conjunto"
    with pytest.raises(treino.ErroApi):
        treino.ClienteTreino("http://api", "")


def test_servico_http_exige_a_chave_e_aceita_o_trabalho(monkeypatch):
    monkeypatch.setenv("TREINO_CHAVE", "segredo-do-teste")
    rodou = []
    monkeypatch.setattr(servico, "executar", lambda cliente, trabalho_id, escrever: rodou.append(trabalho_id))
    cliente = TestClient(servico.app)
    assert cliente.get("/saude").json()["ok"] is True
    assert cliente.post("/treinar", json={"trabalho_id": 4}).status_code == 401
    assert cliente.post("/treinar", json={"trabalho_id": 4}, headers={"X-Treino-Chave": "errada"}).status_code == 401
    r = cliente.post("/treinar", json={"trabalho_id": 4}, headers={"X-Treino-Chave": "segredo-do-teste"})
    assert r.status_code == 202
    for _ in range(200):
        if rodou:
            break
        import time
        time.sleep(0.01)
    assert rodou == [4]


def test_linha_de_comando_exige_trabalho_ou_maquina_com_saida():
    from treino.__main__ import main
    with pytest.raises(SystemExit):
        main(["--maquina-id", "1"])
