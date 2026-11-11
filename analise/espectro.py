"""Analisa uma captura: taxa real, jitter, rotacao pelo sensor optico e espectro por ordens.

Uso:
    python espectro.py dados/t1_ligado.csv --pulsos-por-volta 7 --eixo z
"""
import argparse
import os

import matplotlib.pyplot as plt
import numpy as np

ESCALA_G = 0.0039  # ADXL345 em resolucao total: 3,9 mg por LSB


def carregar(caminho):
    # invalid_raise=False: linha com colunas faltando (serial cortada no meio) e linha de diagnostico
    # sao puladas com aviso, em vez de derrubar a leitura do arquivo inteiro.
    d = np.genfromtxt(caminho, delimiter=",", skip_header=1, invalid_raise=False, comments="#")
    d = np.atleast_2d(d)
    d = d[~np.isnan(d).any(axis=1)]
    t = d[:, 0].astype(np.int64)
    dt = np.diff(t)
    dt[dt < 0] += 2**32  # micros() estoura a cada ~71 min
    return dt, d[:, 1:4] * ESCALA_G, d[:, 4].astype(int)


def rotacao_hz(ir, fs, pulsos_por_volta):
    bordas = np.where((ir[1:] == 1) & (ir[:-1] == 0))[0]
    if len(bordas) < 3:
        return None
    # media sobre todo o trecho: evita o erro de arredondamento de contar amostras inteiras
    periodo = (bordas[-1] - bordas[0]) / (len(bordas) - 1) / fs
    return 1.0 / periodo / pulsos_por_volta


def amplitude_em(freqs, amp, f, largura_hz=1.0):
    janela = (freqs > f - largura_hz) & (freqs < f + largura_hz)
    return amp[janela].max() if janela.any() else float("nan")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("arquivo")
    p.add_argument("--eixo", choices=["x", "y", "z"], default="z")
    p.add_argument("--pulsos-por-volta", type=int, default=1,
                   help="numero de marcas por volta (na ventoinha: numero de pas)")
    p.add_argument("--fmax", type=float, default=None, help="limite do grafico em Hz")
    a = p.parse_args()

    dt_us, acc, ir = carregar(a.arquivo)
    fs = 1e6 / np.median(dt_us)
    jitter = np.std(dt_us)
    atrasos = int(np.sum(dt_us > 1.5 * np.median(dt_us)))

    sinal = acc[:, "xyz".index(a.eixo)]
    sinal = sinal - sinal.mean()
    n = len(sinal)
    w = np.hanning(n)
    espectro = np.fft.rfft(sinal * w)
    amp = 2 * np.abs(espectro) / w.sum()
    freqs = np.fft.rfftfreq(n, 1 / fs)

    print(f"Amostras: {n}  |  duracao: {n / fs:.1f} s")
    print(f"Taxa real: {fs:.1f} Hz  |  jitter: {jitter:.1f} us  |  amostras atrasadas: {atrasos}")
    print(f"Resolucao do espectro: {fs / n:.3f} Hz")
    print(f"RMS total eixo {a.eixo}: {np.sqrt(np.mean(sinal**2)) * 1000:.1f} mg")

    f_rot = rotacao_hz(ir, fs, a.pulsos_por_volta)
    plt.figure(figsize=(11, 5))
    plt.plot(freqs, amp * 1000, lw=0.8)
    if f_rot:
        print(f"Rotacao medida: {f_rot * 60:.0f} rpm ({f_rot:.2f} Hz)")
        for k in (1, 2, 3):
            fk = k * f_rot
            print(f"  {k}X = {fk:6.2f} Hz  ->  {amplitude_em(freqs, amp, fk) * 1000:.2f} mg")
            plt.axvline(fk, color="tab:orange", ls="--", lw=0.8)
            plt.text(fk, plt.ylim()[1] * 0.92, f"{k}X", color="tab:orange")
        if a.pulsos_por_volta > 1:
            fp = a.pulsos_por_volta * f_rot
            print(f"  passagem ({a.pulsos_por_volta}X) = {fp:.2f} Hz  ->  "
                  f"{amplitude_em(freqs, amp, fp) * 1000:.2f} mg")
            plt.axvline(fp, color="tab:red", ls=":", lw=0.8)
    else:
        print("Rotacao: sem pulsos suficientes do sensor optico.")

    plt.xlim(0, a.fmax or fs / 2)
    plt.xlabel("Frequencia (Hz)")
    plt.ylabel("Amplitude (mg)")
    plt.title(f"{os.path.basename(a.arquivo)}  |  eixo {a.eixo}  |  fs {fs:.0f} Hz")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    saida = os.path.splitext(a.arquivo)[0] + f"_espectro_{a.eixo}.png"
    plt.savefig(saida, dpi=130)
    print(f"Grafico salvo em {saida}")
    plt.show()


if __name__ == "__main__":
    main()
