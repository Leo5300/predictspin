"""Testes do bancada.py com dados sintéticos: cada conta confere com um valor calculado à mão."""
import csv
import math

import numpy as np
import pytest

import bancada

COLUNAS = ["ensaio", "etapa", "condicao", "rotacao_alvo_rpm", "simulado", "janela_id", "medido_em", "ponto",
           "rms_g", "ordem_1x", "marca", "evento_marcado", "vel_rms_mm_s"]


def exportacao(caminho, linhas):
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS)
        w.writeheader()
        for l in linhas:
            base = {"condicao": "normal", "rotacao_alvo_rpm": "450", "simulado": "false", "janela_id": "1",
                    "medido_em": "2026-11-20T12:00:00Z", "ordem_1x": "0", "marca": "", "evento_marcado": "false",
                    "vel_rms_mm_s": ""}
            base.update(l)
            w.writerow(base)
    return caminho


def linha(ensaio, etapa, ponto, rms, vel="", o1x="0", **outros):
    return {"ensaio": ensaio, "etapa": etapa, "ponto": ponto, "rms_g": str(rms), "vel_rms_mm_s": str(vel),
            "ordem_1x": str(o1x), **outros}


# ---------------------------------------------------------------- piso de ruído

def test_piso_de_ruido_por_ponto_so_com_t0_sem_marca(tmp_path):
    rms_a = [0.010, 0.012, 0.011, 0.013, 0.009]
    linhas = [linha("E-T0-1", "T0", "A", r, vel=v) for r, v in zip(rms_a, [0.10, 0.12, 0.11, 0.13, 0.09])]
    linhas += [linha("E-T0-1", "T0", "B", 0.020)]  * 3
    linhas += [linha("E-T1-1", "T1", "A", 0.500)]  # outra etapa: fora
    linhas += [linha("E-T0-1", "T0", "A", 0.900, marca="rapida")]  # janela marcada: fora
    linhas += [linha("E-T0-1", "T0", "A", 0.900, evento_marcado="true")]  # evento marcado: fora
    r = bancada.piso_de_ruido(bancada.ler_exportacao(exportacao(tmp_path / "e.csv", linhas)))

    a = r["A"]["rms_g"]
    assert a["n"] == 5
    assert a["media"] == pytest.approx(0.011)
    assert a["desvio"] == pytest.approx(np.std(rms_a, ddof=1))
    assert a["max"] == pytest.approx(0.013)
    assert a["p95"] == pytest.approx(np.percentile(rms_a, 95))
    assert a["limite"] == pytest.approx(0.011 + 3 * np.std(rms_a, ddof=1))
    assert r["A"]["vel_rms_mm_s"]["media"] == pytest.approx(0.11)
    # B sem velocidade (envio antigo) e sem variação
    assert r["B"]["vel_rms_mm_s"] is None
    assert r["B"]["rms_g"]["desvio"] == 0.0


def test_piso_de_ruido_filtra_os_ensaios_pedidos(tmp_path):
    linhas = [linha("E1", "T0", "A", 0.01), linha("E1", "T0", "A", 0.03), linha("E2", "T0", "A", 1.0)]
    r = bancada.piso_de_ruido(bancada.ler_exportacao(exportacao(tmp_path / "e.csv", linhas)), ensaios=["E1"])
    assert r["A"]["rms_g"]["media"] == pytest.approx(0.02)
    assert r["A"]["ensaios"] == ["E1"]


def test_saida_do_piso_declara_o_limite_e_avisa_dado_simulado(tmp_path):
    linhas = [linha("E1", "T0", "A", 0.01, simulado="true"), linha("E1", "T0", "A", 0.02, simulado="true")]
    caminho = exportacao(tmp_path / "e.csv", linhas)
    saida = []
    assert bancada.main(["piso-ruido", str(caminho)], escrever=saida.append) == 0
    texto = "\n".join(saida)
    assert "SIMULADOS" in texto
    assert "Abaixo dele nada se afirma" in texto
    assert "média + 3 desvios" in texto


# ---------------------------------------------------------------- teste-reteste

def test_teste_reteste_da_o_cv_entre_as_medias_dos_ensaios(tmp_path):
    medias = {"R1": 0.10, "R2": 0.12, "R3": 0.11, "R4": 0.09, "R5": 0.08}
    linhas = []
    for ensaio, m in medias.items():
        # duas janelas por ensaio, simétricas em torno da média do ensaio
        linhas += [linha(ensaio, "T1", "A", m - 0.005, o1x=m / 2, vel=10 * m),
                   linha(ensaio, "T1", "A", m + 0.005, o1x=m / 2, vel=10 * m)]
    r, avisos = bancada.teste_reteste(bancada.ler_exportacao(exportacao(tmp_path / "e.csv", linhas)),
                                      list(medias))
    assert avisos == []
    valores = list(medias.values())
    cv = np.std(valores, ddof=1) / np.mean(valores)
    assert r["A"]["rms_g"]["n"] == 5
    assert r["A"]["rms_g"]["cv"] == pytest.approx(cv)
    assert r["A"]["ordem_1x"]["cv"] == pytest.approx(cv)  # 1X proporcional: mesmo CV
    assert r["A"]["vel_rms_mm_s"]["cv"] == pytest.approx(cv)
    assert r["A"]["medias"]["R2"]["rms_g"] == pytest.approx(0.12)


def test_teste_reteste_avisa_etapa_rotacao_e_ensaio_faltando(tmp_path):
    linhas = [linha("R1", "T1", "A", 0.1), linha("R2", "T3", "A", 0.1, rotacao_alvo_rpm="900")]
    r, avisos = bancada.teste_reteste(bancada.ler_exportacao(exportacao(tmp_path / "e.csv", linhas)),
                                      ["R1", "R2", "R3"])
    assert any("R3" in a for a in avisos)
    assert any("T1" in a for a in avisos)
    assert any("rotações" in a for a in avisos)
    assert math.isnan(r["A"]["vel_rms_mm_s"]["cv"])  # sem velocidade: não inventa CV


def test_teste_reteste_pede_dois_ensaios(tmp_path):
    caminho = exportacao(tmp_path / "e.csv", [linha("R1", "T1", "A", 0.1)])
    with pytest.raises(SystemExit):
        bancada.main(["teste-reteste", str(caminho), "--ensaios", "R1"], escrever=lambda _: None)


# ---------------------------------------------------------------- banda

def captura(caminho, sinal, taxa=None, ponto="A", eixo="z"):
    colunas = ["t_us", "ax_A", "ay_A", "az_A", "ax_B", "ay_B", "az_B", "ax_C", "ay_C", "az_C", "ir"]
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        if taxa:
            f.write(f"# taxa_hz={taxa:g} ponto={ponto}\n")
        w = csv.writer(f)
        w.writerow(colunas)
        for i, v in enumerate(sinal):
            linha_csv = [str(i * 312)] + [""] * 9 + ["0"]
            linha_csv[colunas.index(f"a{eixo}_{ponto}")] = str(int(round(v)))
            w.writerow(linha_csv)
        w.writerow(["999999"] + [""] * 10)  # linha sem amostra do ponto: fica fora
    return caminho


def test_fracao_de_energia_acima_de_800_hz(tmp_path):
    taxa = 3200
    t = np.arange(10 * taxa) / taxa
    # 100 Hz com amplitude 400 e 1200 Hz com amplitude 200: 200^2 / (400^2 + 200^2) = 20% acima de 800 Hz
    sinal = 256 + 400 * np.sin(2 * np.pi * 100 * t) + 200 * np.sin(2 * np.pi * 1200 * t + 0.4)
    caminho = captura(tmp_path / "c.csv", sinal, taxa=taxa)
    assert bancada.taxa_da_captura(caminho) == 3200
    x = bancada.ler_captura(caminho)
    assert len(x) == len(sinal)
    freq, psd = bancada.espectro(x, taxa)
    assert freq[np.argmax(psd)] == pytest.approx(100, abs=1)
    assert bancada.fracao_de_energia(freq, psd) == pytest.approx(0.20, abs=0.005)


def test_sinal_so_abaixo_de_800_hz_da_fracao_quase_zero(tmp_path):
    taxa = 3200
    t = np.arange(5 * taxa) / taxa
    freq, psd = bancada.espectro(300 * np.sin(2 * np.pi * 250 * t), taxa)
    assert bancada.fracao_de_energia(freq, psd) < 1e-3
    assert bancada.fracao_de_energia(freq, np.zeros_like(psd)) == 0.0


def test_banda_pela_linha_de_comando_grava_espectro_e_grafico(tmp_path):
    taxa = 3200
    t = np.arange(4 * taxa) / taxa
    caminho = captura(tmp_path / "c.csv", 100 * np.sin(2 * np.pi * 1000 * t), eixo="x")  # sem a linha da taxa
    saida = []
    espectro_csv, grafico = tmp_path / "esp.csv", tmp_path / "esp.png"
    with pytest.raises(SystemExit):  # sem taxa na captura nem no argumento
        bancada.main(["banda", str(caminho), "--eixo", "x"], escrever=saida.append)
    assert bancada.main(["banda", str(caminho), "--eixo", "x", "--taxa", "3200", "--espectro", str(espectro_csv),
                         "--grafico", str(grafico)], escrever=saida.append) == 0
    assert "Fração da energia entre 800 e 1600 Hz" in "\n".join(saida)
    assert espectro_csv.read_text(encoding="utf-8").startswith("frequencia_hz,densidade_lsb2_por_hz")
    assert grafico.stat().st_size > 1000


def test_coluna_que_nao_existe_na_captura_e_recusada(tmp_path):
    caminho = tmp_path / "c.csv"
    caminho.write_text("t_us,ax,ay,az,ir\n0,1,2,3,0\n", encoding="utf-8")
    with pytest.raises(ValueError, match="az_A"):
        bancada.ler_captura(caminho)
