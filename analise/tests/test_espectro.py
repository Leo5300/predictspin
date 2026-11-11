"""Testes da leitura de captura em analise/espectro.py."""
import warnings

import numpy as np
import pytest

import espectro


def escrever(tmp_path, linhas):
    caminho = tmp_path / "captura.csv"
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return caminho


def test_linha_com_colunas_faltando_nao_derruba_a_leitura(tmp_path):
    caminho = escrever(tmp_path, [
        "t_us,ax,ay,az,ir",
        "1000,10,20,256,0",
        "1625,11,21",          # serial cortada no meio da linha
        "2250,12,22,258,1",
        "2875,13,23,259,0",
    ])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        dt, acc, ir = espectro.carregar(caminho)

    assert len(acc) == 3
    assert list(dt) == [1250, 625]
    assert acc[0, 2] == pytest.approx(256 * espectro.ESCALA_G)
    assert list(ir) == [0, 1, 0]


def test_linha_de_diagnostico_e_valor_invalido_sao_ignorados(tmp_path):
    caminho = escrever(tmp_path, [
        "t_us,ax,ay,az,ir",
        "#inicio",
        "1000,10,20,256,0",
        "1625,x,21,257,0",     # valor que não é número vira NaN e sai
        "2250,12,22,258,1",
    ])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        dt, acc, ir = espectro.carregar(caminho)

    assert len(acc) == 2
    assert list(dt) == [1250]


def test_estouro_do_micros_e_corrigido(tmp_path):
    caminho = escrever(tmp_path, [
        "t_us,ax,ay,az,ir",
        f"{2**32 - 300},0,0,256,0",
        "325,0,0,256,0",
    ])
    dt, _, _ = espectro.carregar(caminho)
    assert list(dt) == [625]
    assert dt.dtype == np.int64
