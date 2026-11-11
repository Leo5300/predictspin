"""Captura o sinal bruto enviado pelo ESP32 e grava em CSV.

Dois formatos de entrada:

- binario (padrão): firmware de 3 sensores. O script liga o sinal bruto com o comando "bruto 1",
  decodifica os quadros binários (ver docs/firmware.md) e desliga com "bruto 0" no fim.
  CSV: t_us,ax_A,ay_A,az_A,ax_B,ay_B,az_B,ax_C,ay_C,az_C,ir
- texto: firmware antigo de 1 sensor, que já manda t_us,ax,ay,az,ir em texto.
  CSV: t_us,ax,ay,az,ir (o mesmo que analise/espectro.py lê)

Uso:
    python captura.py --porta COM5 --segundos 10 --saida dados/t1_ligado.csv
    python captura.py --porta COM5 --segundos 10 --saida dados/antigo.csv --formato texto
"""
import argparse
import os
import struct
import time

CABECALHO_TEXTO = "t_us,ax,ay,az,ir"
CABECALHO_BINARIO = "t_us,ax_A,ay_A,az_A,ax_B,ay_B,az_B,ax_C,ay_C,az_C,ir"

SINC = b"\xA5\x5A"
TIPO_AMOSTRAS = 0x01
CABECALHO_QUADRO = 2 + 1 + 1 + 4 + 1 + 3   # sinc, tipo, seq, t_us, ir, nA nB nC
MAX_POR_SENSOR = 33
PERIODO_NOMINAL_US = 625                   # 1600 amostras/s
PONTOS = ("A", "B", "C")


def crc16(dados, crc=0xFFFF):
    """CRC-16/CCITT-FALSE, o mesmo do firmware (lib/protocolo)."""
    for byte in dados:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return crc


class Quadro:
    """Um tick de aquisição: instante, nível do sensor de rotação e as amostras de cada ponto."""

    def __init__(self, seq, t_us, ir, amostras):
        self.seq = seq
        self.t_us = t_us
        self.ir = ir
        self.amostras = amostras  # tupla de 3 listas de (x, y, z)

    def linhas_csv(self):
        """Uma linha por posição de amostra no tick, alinhadas pelo fim (a última de cada sensor é a
        mais recente). Sensor com menos amostras que os outros neste tick fica vazio no começo."""
        m = max(len(a) for a in self.amostras)
        linhas = []
        for k in range(m):
            t = (self.t_us - (m - 1 - k) * PERIODO_NOMINAL_US) % 2**32
            campos = [str(t)]
            for amostras in self.amostras:
                i = k - (m - len(amostras))
                campos.extend([str(v) for v in amostras[i]] if i >= 0 else ["", "", ""])
            campos.append(str(self.ir))
            linhas.append(",".join(campos))
        return linhas


class Decodificador:
    """Separa os quadros binários do fluxo da serial. Aceita bytes em pedaços de qualquer tamanho;
    pula texto e lixo entre quadros e descarta quadro com CRC errado."""

    def __init__(self):
        self._buffer = bytearray()
        self._ultimo_seq = None
        self.quadros = 0
        self.erros_crc = 0
        self.bytes_descartados = 0
        self.quadros_perdidos = 0  # buracos na sequência (quadros que o firmware não conseguiu mandar)

    def alimentar(self, dados):
        """Devolve a lista de quadros completos encontrados até aqui."""
        self._buffer.extend(dados)
        saida = []
        while True:
            inicio = self._buffer.find(SINC)
            if inicio < 0:
                # guarda o último byte: pode ser a metade de um SINC
                manter = 1 if self._buffer[-1:] == SINC[:1] else 0
                self.bytes_descartados += len(self._buffer) - manter
                del self._buffer[:len(self._buffer) - manter]
                return saida
            if inicio > 0:
                self.bytes_descartados += inicio
                del self._buffer[:inicio]
            if len(self._buffer) < CABECALHO_QUADRO:
                return saida
            tipo, seq, t_us, ir, na, nb, nc = struct.unpack_from("<BBIB3B", self._buffer, 2)
            if tipo != TIPO_AMOSTRAS or max(na, nb, nc) > MAX_POR_SENSOR:
                self._pular_sinc()
                continue
            tamanho = CABECALHO_QUADRO + 6 * (na + nb + nc) + 2
            if len(self._buffer) < tamanho:
                return saida
            corpo = bytes(self._buffer[2:tamanho - 2])
            (crc,) = struct.unpack_from("<H", self._buffer, tamanho - 2)
            if crc16(corpo) != crc:
                self.erros_crc += 1
                self._pular_sinc()
                continue
            valores = struct.unpack_from("<%dh" % (3 * (na + nb + nc)), self._buffer, CABECALHO_QUADRO)
            amostras, pos = [], 0
            for n in (na, nb, nc):
                amostras.append([tuple(valores[pos + 3 * i: pos + 3 * i + 3]) for i in range(n)])
                pos += 3 * n
            del self._buffer[:tamanho]
            if self._ultimo_seq is not None:
                self.quadros_perdidos += (seq - self._ultimo_seq - 1) % 256
            self._ultimo_seq = seq
            self.quadros += 1
            saida.append(Quadro(seq, t_us, ir, tuple(amostras)))

    def _pular_sinc(self):
        self.bytes_descartados += 2
        del self._buffer[:2]


def linha_texto_valida(linha):
    """Formato antigo: 5 campos inteiros, sem linha de diagnóstico."""
    if not linha or linha.startswith("#"):
        return False
    partes = linha.split(",")
    if len(partes) != 5:
        return False
    try:
        [int(p) for p in partes]
    except ValueError:
        return False
    return True


def capturar_texto(ser, segundos, saida):
    print("Aguardando o ESP32 (se nao comecar em 5 s, aperte o botao EN)...")
    limite = time.time() + 15
    while True:
        linha = ser.readline().decode(errors="ignore").strip()
        if linha.startswith("#erro"):
            print(linha)
        if linha == CABECALHO_TEXTO:
            break
        if time.time() > limite:
            raise SystemExit("Cabecalho nao recebido. Confira a porta e aperte EN no ESP32.")
    n = 0
    fim = time.time() + segundos
    with open(saida, "w", encoding="utf-8") as f:
        f.write(CABECALHO_TEXTO + "\n")
        while time.time() < fim:
            linha = ser.readline().decode(errors="ignore").strip()
            if linha_texto_valida(linha):
                f.write(linha + "\n")
                n += 1
    print(f"Pronto: {n} amostras (~{n / segundos:.0f} por segundo).")


def capturar_binario(ser, segundos, saida):
    ser.reset_input_buffer()
    ser.write(b"bruto 1\n")
    dec = Decodificador()
    contagem = [0, 0, 0]
    try:
        with open(saida, "w", encoding="utf-8") as f:
            f.write(CABECALHO_BINARIO + "\n")
            fim = time.time() + segundos
            while time.time() < fim:
                for q in dec.alimentar(ser.read(4096)):
                    for i, a in enumerate(q.amostras):
                        contagem[i] += len(a)
                    f.write("\n".join(q.linhas_csv()) + "\n")
    finally:
        ser.write(b"bruto 0\n")
    if dec.quadros == 0:
        raise SystemExit("Nenhum quadro recebido. Confira a porta, o baud (921600) e se o firmware é o de 3 sensores.")
    taxas = " / ".join(f"{p}: {c / segundos:.0f}/s" for p, c in zip(PONTOS, contagem))
    print(f"Pronto: {dec.quadros} quadros, amostras {taxas}.")
    print(f"Quadros perdidos pelo firmware: {dec.quadros_perdidos}; erros de CRC: {dec.erros_crc}; "
          f"bytes fora de quadro: {dec.bytes_descartados}.")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--porta", required=True, help="ex.: COM5 (Windows) ou /dev/ttyUSB0")
    p.add_argument("--segundos", type=float, default=10.0)
    p.add_argument("--saida", required=True)
    p.add_argument("--baud", type=int, default=921600)
    p.add_argument("--formato", choices=("binario", "texto"), default="binario",
                   help="binario: firmware de 3 sensores (padrão); texto: firmware antigo de 1 sensor")
    a = p.parse_args()

    import serial  # só aqui: os testes usam o decodificador sem precisar do pyserial

    pasta = os.path.dirname(a.saida)
    if pasta:
        os.makedirs(pasta, exist_ok=True)
    with serial.Serial(a.porta, a.baud, timeout=0.2) as ser:
        print(f"Gravando {a.segundos:.0f} s em {a.saida} ...")
        if a.formato == "texto":
            capturar_texto(ser, a.segundos, a.saida)
        else:
            capturar_binario(ser, a.segundos, a.saida)


if __name__ == "__main__":
    main()
