"""Captura o sinal bruto enviado pelo ESP32 e grava em CSV.

Uso:
    python captura.py --porta COM5 --segundos 10 --saida dados/t0_desligado.csv
"""
import argparse
import os
import time

import serial

CABECALHO = "t_us,ax,ay,az,ir"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--porta", required=True, help="ex.: COM5 (Windows) ou /dev/ttyUSB0")
    p.add_argument("--segundos", type=float, default=10.0)
    p.add_argument("--saida", required=True)
    p.add_argument("--baud", type=int, default=921600)
    a = p.parse_args()

    pasta = os.path.dirname(a.saida)
    if pasta:
        os.makedirs(pasta, exist_ok=True)

    with serial.Serial(a.porta, a.baud, timeout=1) as ser:
        print("Aguardando o ESP32 (se nao comecar em 5 s, aperte o botao EN)...")
        limite = time.time() + 15
        while True:
            linha = ser.readline().decode(errors="ignore").strip()
            if linha.startswith("#erro"):
                print(linha)
            if linha == CABECALHO:
                break
            if time.time() > limite:
                raise SystemExit("Cabecalho nao recebido. Confira a porta e aperte EN no ESP32.")

        print(f"Gravando {a.segundos:.0f} s em {a.saida} ...")
        n = 0
        fim = time.time() + a.segundos
        with open(a.saida, "w", encoding="utf-8") as f:
            f.write(CABECALHO + "\n")
            while time.time() < fim:
                linha = ser.readline().decode(errors="ignore").strip()
                if not linha or linha.startswith("#"):
                    continue
                if linha.count(",") != 4:
                    continue  # linha corrompida
                f.write(linha + "\n")
                n += 1

    print(f"Pronto: {n} amostras (~{n / a.segundos:.0f} por segundo).")


if __name__ == "__main__":
    main()
