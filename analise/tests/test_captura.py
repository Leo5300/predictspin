"""Testes do decodificador do sinal bruto (analise/captura.py) com bytes sintéticos."""
import struct

import captura


def quadro(seq, t_us, ir, amostras, crc_errado=False):
    """Monta um quadro como o firmware (lib/protocolo/Protocolo.cpp, montarQuadro)."""
    n = [len(a) for a in amostras]
    corpo = struct.pack("<BBIB3B", captura.TIPO_AMOSTRAS, seq, t_us, ir, *n)
    for a in amostras:
        for x, y, z in a:
            corpo += struct.pack("<3h", x, y, z)
    crc = captura.crc16(corpo) ^ (1 if crc_errado else 0)
    return captura.SINC + corpo + struct.pack("<H", crc)


A1 = [(1, -2, 256), (3, -4, 257)]
C1 = [(-4096, 4095, 0)]


def test_crc_igual_ao_do_firmware():
    # mesmo valor de referência do teste nativo (CRC-16/CCITT-FALSE de "123456789")
    assert captura.crc16(b"123456789") == 0x29B1


def test_decodifica_um_quadro():
    dec = captura.Decodificador()
    qs = dec.alimentar(quadro(7, 1000, 1, [A1, [], C1]))
    assert len(qs) == 1
    q = qs[0]
    assert (q.seq, q.t_us, q.ir) == (7, 1000, 1)
    assert q.amostras == (A1, [], C1)
    assert dec.erros_crc == 0 and dec.bytes_descartados == 0


def test_quadro_partido_em_varios_pedacos():
    dados = quadro(1, 5, 0, [A1, A1, C1])
    dec = captura.Decodificador()
    achados = []
    for i in range(len(dados)):
        achados += dec.alimentar(dados[i:i + 1])
    assert len(achados) == 1
    assert achados[0].amostras[1] == A1


def test_pula_texto_e_lixo_entre_quadros():
    fluxo = (b"# bruto ligado\n" + quadro(1, 10, 0, [A1, [], []]) + b"\x00\x13\xA5garbage"
             + quadro(2, 20, 0, [A1, [], []]))
    dec = captura.Decodificador()
    qs = dec.alimentar(fluxo)
    assert [q.seq for q in qs] == [1, 2]
    assert dec.bytes_descartados > 0


def test_descarta_quadro_com_crc_errado_e_segue():
    fluxo = quadro(1, 10, 0, [A1, [], []], crc_errado=True) + quadro(2, 20, 0, [A1, [], []])
    dec = captura.Decodificador()
    qs = dec.alimentar(fluxo)
    assert [q.seq for q in qs] == [2]
    assert dec.erros_crc == 1


def test_conta_quadros_perdidos_pela_sequencia_inclusive_na_volta_de_255():
    dec = captura.Decodificador()
    dec.alimentar(quadro(254, 0, 0, [A1, [], []]))
    dec.alimentar(quadro(255, 0, 0, [A1, [], []]))
    dec.alimentar(quadro(2, 0, 0, [A1, [], []]))  # perdeu 0 e 1
    assert dec.quadros == 3
    assert dec.quadros_perdidos == 2


def test_contagem_impossivel_nao_trava_o_decodificador():
    ruim = captura.SINC + struct.pack("<BBIB3B", captura.TIPO_AMOSTRAS, 0, 0, 0, 200, 0, 0)
    dec = captura.Decodificador()
    qs = dec.alimentar(ruim + quadro(5, 0, 0, [A1, [], []]))
    assert [q.seq for q in qs] == [5]


def test_linhas_csv_alinhadas_pelo_fim_com_contagens_diferentes():
    q = captura.Quadro(9, 10000, 1, ([(1, 1, 1), (2, 2, 2), (3, 3, 3)], [(7, 7, 7), (8, 8, 8)], []))
    linhas = q.linhas_csv()
    assert len(linhas) == 3
    assert linhas[0] == "8750,1,1,1,,,,,,,1"
    assert linhas[1] == "9375,2,2,2,7,7,7,,,,1"
    assert linhas[2] == "10000,3,3,3,8,8,8,,,,1"
    # mesmo número de colunas do cabeçalho
    assert all(l.count(",") == captura.CABECALHO_BINARIO.count(",") for l in linhas)


def test_instante_atravessa_o_estouro_do_micros():
    q = captura.Quadro(0, 100, 0, ([(0, 0, 0), (0, 0, 0)], [], []))
    assert q.linhas_csv()[0].startswith(str(2**32 + 100 - 625) + ",")


def test_formato_texto_antigo_continua_aceito():
    assert captura.linha_texto_valida("1000,10,20,256,0")
    assert not captura.linha_texto_valida("#inicio")
    assert not captura.linha_texto_valida("t_us,ax,ay,az,ir")
    assert not captura.linha_texto_valida("1000,10,20")
    assert not captura.linha_texto_valida("")
