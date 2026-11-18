"""Medições de bancada que viram número: piso de ruído, teste-reteste da montagem e banda acima de 800 Hz.

Os três subcomandos leem arquivos que a bancada produz e só fazem contas: nenhum número sai daqui
sem um arquivo de medição por trás. Com o exportar.csv de dados SIMULADOS (coluna simulado = true) o
resultado é teste da conta, não medição; o script avisa.

    python bancada.py piso-ruido exportar.csv [--ensaios COD1,COD2]
        Ensaios T0 (torno desligado, oficina funcionando): por ponto, média, desvio, p95 e máximo do
        RMS (g) e da velocidade (mm/s), e o limite de detecção = média + 3 desvios. Abaixo dele nada
        se afirma.

    python bancada.py teste-reteste exportar.csv --ensaios COD1,COD2,COD3,...
        N ensaios T1 repetidos na mesma rotação, tirando e recolocando o ímã entre eles: por ponto, o
        coeficiente de variação (desvio / média entre os ensaios) do RMS, da ordem 1X e da velocidade.
        É a incerteza de montagem.

    python bancada.py banda captura.csv --taxa 3200 [--ponto A] [--eixo z] [--espectro saida.csv] [--grafico saida.png]
        Captura do sinal bruto a 3200 Hz: fração da energia entre 800 e 1600 Hz, que é a que dobraria
        para dentro da banda na aquisição a 1600 Hz. O firmware AINDA NÃO tem o comando que faz essa
        captura (item 5.3 da segunda rodada, não feito); a conta já está pronta e testada com sinal
        sintético. Sem a linha "# taxa_hz=" no arquivo, informe --taxa.

Linhas do exportar.csv com "marca" preenchida (modo rápido, amostras incompletas) ou com
evento_marcado = true ficam fora das contas, como no conjunto de treino.
"""
import argparse
import csv
import math
import sys
from collections import defaultdict

import numpy as np

PONTOS = ("A", "B", "C")
BANDA_ALTA_HZ = (800.0, 1600.0)


# ---------------------------------------------------------------- leitura do exportar.csv

def ler_exportacao(caminho):
    """Linhas do exportar.csv como dicionários; só as que servem para conta (sem marca e sem evento)."""
    with open(caminho, newline="", encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    return [l for l in linhas if not l.get("marca") and l.get("evento_marcado", "false") != "true"]


def numero(texto):
    """Número do CSV; vazio vira None."""
    return float(texto) if texto not in (None, "") else None


def estatisticas(valores):
    """Média, desvio (amostral), p95, máximo e limite de detecção (média + 3 desvios)."""
    v = np.asarray(valores, dtype=float)
    desvio = float(np.std(v, ddof=1)) if len(v) > 1 else float("nan")
    media = float(np.mean(v))
    return {
        "n": len(v),
        "media": media,
        "desvio": desvio,
        "p95": float(np.percentile(v, 95)),
        "max": float(np.max(v)),
        "limite": media + 3 * desvio,
    }


def coeficiente_de_variacao(valores):
    """Desvio amostral / média (fração); nan com menos de dois valores ou média zero."""
    v = np.asarray(valores, dtype=float)
    if len(v) < 2 or np.mean(v) == 0:
        return float("nan")
    return float(np.std(v, ddof=1) / np.mean(v))


def simulados(linhas):
    return any(l.get("simulado") == "true" for l in linhas)


# ---------------------------------------------------------------- piso de ruído

def piso_de_ruido(linhas, ensaios=None):
    """Por ponto: estatísticas do RMS (g) e da velocidade (mm/s) nas janelas T0."""
    t0 = [l for l in linhas if l["etapa"] == "T0" and (not ensaios or l["ensaio"] in ensaios)]
    resultado = {}
    for ponto in sorted({l["ponto"] for l in t0}):
        do_ponto = [l for l in t0 if l["ponto"] == ponto]
        rms = [numero(l["rms_g"]) for l in do_ponto]
        vel = [numero(l.get("vel_rms_mm_s")) for l in do_ponto]
        vel = [v for v in vel if v is not None]
        resultado[ponto] = {
            "ensaios": sorted({l["ensaio"] for l in do_ponto}),
            "rms_g": estatisticas(rms),
            "vel_rms_mm_s": estatisticas(vel) if vel else None,
        }
    return resultado


def imprimir_piso(resultado, escrever=print):
    if not resultado:
        escrever("Nenhuma janela T0 sem marca no arquivo.")
        return
    escrever("Piso de ruído (T0: torno desligado, oficina funcionando)")
    escrever(f"{'ponto':<6}{'grandeza':<14}{'janelas':>8}{'média':>12}{'desvio':>12}{'p95':>12}{'máximo':>12}{'limite':>12}")
    for ponto, r in resultado.items():
        for nome, unidade in (("rms_g", "g"), ("vel_rms_mm_s", "mm/s")):
            e = r[nome]
            if e is None:
                escrever(f"{ponto:<6}{nome:<14}{0:>8}  (sem velocidade nas janelas)")
                continue
            escrever(f"{ponto:<6}{nome:<14}{e['n']:>8}{e['media']:>12.5f}{e['desvio']:>12.5f}{e['p95']:>12.5f}"
                     f"{e['max']:>12.5f}{e['limite']:>12.5f}  {unidade}")
    escrever("Limite de detecção = média + 3 desvios. Abaixo dele nada se afirma: um valor menor que o limite "
             "não se distingue do ruído da oficina com o torno parado.")


# ---------------------------------------------------------------- teste-reteste

def teste_reteste(linhas, ensaios):
    """Por ponto: média de cada ensaio e o coeficiente de variação entre os ensaios."""
    escolhidas = [l for l in linhas if l["ensaio"] in ensaios]
    faltando = [e for e in ensaios if e not in {l["ensaio"] for l in escolhidas}]
    avisos = []
    if faltando:
        avisos.append(f"ensaios sem janela utilizável no arquivo: {', '.join(faltando)}")
    etapas = {l["etapa"] for l in escolhidas}
    if etapas - {"T1"}:
        avisos.append(f"o teste-reteste pede ensaios T1; vieram {', '.join(sorted(etapas))}")
    rotacoes = {l["rotacao_alvo_rpm"] for l in escolhidas}
    if len(rotacoes) > 1:
        avisos.append(f"rotações alvo diferentes entre os ensaios: {', '.join(sorted(rotacoes))}")

    resultado = {}
    for ponto in sorted({l["ponto"] for l in escolhidas}):
        por_ensaio = defaultdict(lambda: {"rms_g": [], "ordem_1x": [], "vel_rms_mm_s": []})
        for l in escolhidas:
            if l["ponto"] != ponto:
                continue
            for campo in ("rms_g", "ordem_1x", "vel_rms_mm_s"):
                valor = numero(l.get(campo))
                if valor is not None:
                    por_ensaio[l["ensaio"]][campo].append(valor)
        medias = {e: {c: (float(np.mean(v)) if v else None) for c, v in campos.items()}
                  for e, campos in por_ensaio.items()}
        linha = {"medias": medias}
        for campo in ("rms_g", "ordem_1x", "vel_rms_mm_s"):
            valores = [m[campo] for m in medias.values() if m[campo] is not None]
            linha[campo] = {"n": len(valores), "media": float(np.mean(valores)) if valores else float("nan"),
                            "cv": coeficiente_de_variacao(valores)}
        resultado[ponto] = linha
    return resultado, avisos


def imprimir_reteste(resultado, avisos, escrever=print):
    for aviso in avisos:
        escrever(f"AVISO: {aviso}")
    if not resultado:
        escrever("Nenhuma janela sem marca dos ensaios pedidos.")
        return
    escrever("Teste-reteste (mesma rotação, ímã tirado e recolocado entre os ensaios)")
    escrever(f"{'ponto':<6}{'grandeza':<14}{'montagens':>10}{'média':>12}{'CV':>9}")
    for ponto, r in resultado.items():
        for campo in ("rms_g", "ordem_1x", "vel_rms_mm_s"):
            e = r[campo]
            cv = "-" if math.isnan(e["cv"]) else f"{100 * e['cv']:.1f}%"
            media = "-" if math.isnan(e["media"]) else f"{e['media']:.5f}"
            escrever(f"{ponto:<6}{campo:<14}{e['n']:>10}{media:>12}{cv:>9}")
    escrever("CV = desvio entre as médias dos ensaios / média. É a incerteza de montagem: diferença menor que "
             "ela entre duas condições não se separa da recolocação do sensor.")


# ---------------------------------------------------------------- banda

def ler_captura(caminho, ponto="A", eixo="z"):
    """Coluna de um eixo da captura binária (t_us, ax_A, ay_A, az_A, ...); linhas vazias ficam fora."""
    coluna = f"a{eixo}_{ponto}"
    with open(caminho, newline="", encoding="utf-8") as f:
        leitor = csv.DictReader(l for l in f if not l.startswith("#"))
        if coluna not in (leitor.fieldnames or []):
            raise ValueError(f"coluna {coluna} não está na captura (colunas: {leitor.fieldnames})")
        return np.array([float(l[coluna]) for l in leitor if l[coluna] not in ("", None)])


def taxa_da_captura(caminho):
    """Taxa gravada na primeira linha da captura ("# taxa_hz=3200"), ou None (o captura.py de hoje não grava)."""
    with open(caminho, encoding="utf-8") as f:
        primeira = f.readline().strip()
    if primeira.startswith("#") and "taxa_hz=" in primeira:
        return float(primeira.split("taxa_hz=")[1].split()[0])
    return None


def espectro(sinal, taxa, segundos_por_trecho=1.0):
    """Densidade espectral pelo método de Welch (janela de Hann, 50% de sobreposição), sem o nível DC."""
    x = np.asarray(sinal, dtype=float)
    n = min(len(x), int(taxa * segundos_por_trecho))
    if n < 16:
        raise ValueError("captura curta demais para o espectro")
    janela = np.hanning(n)
    passo = n // 2
    trechos = [x[i:i + n] for i in range(0, len(x) - n + 1, passo)]
    potencias = [np.abs(np.fft.rfft((t - np.mean(t)) * janela)) ** 2 for t in trechos]
    psd = np.mean(potencias, axis=0) / (taxa * np.sum(janela ** 2))
    psd[1:-1] *= 2  # espectro de um lado
    return np.fft.rfftfreq(n, 1.0 / taxa), psd


def fracao_de_energia(frequencias, psd, banda=BANDA_ALTA_HZ):
    """Fração da energia (sem o DC) que está na banda [início, fim)."""
    total = np.sum(psd[1:])
    if total <= 0:
        return 0.0
    dentro = (frequencias >= banda[0]) & (frequencias < banda[1])
    return float(np.sum(psd[dentro]) / total)


def imprimir_banda(fracao, taxa, ponto, eixo, n, escrever=print):
    escrever(f"Captura de {n} amostras do ponto {ponto}, eixo {eixo}, a {taxa:.0f} Hz ({n / taxa:.1f} s)")
    escrever(f"Fração da energia entre {BANDA_ALTA_HZ[0]:.0f} e {min(BANDA_ALTA_HZ[1], taxa / 2):.0f} Hz: "
             f"{100 * fracao:.2f}%")
    escrever("É a energia que, na aquisição normal a 1600 Hz, o filtro do sensor precisa barrar para não dobrar "
             "para dentro da banda de 0 a 800 Hz.")


# ---------------------------------------------------------------- linha de comando

def main(argv=None, escrever=print):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="comando", required=True)
    piso = sub.add_parser("piso-ruido", help="piso de ruído em T0")
    piso.add_argument("exportacao")
    piso.add_argument("--ensaios", help="códigos separados por vírgula (padrão: todos os T0 do arquivo)")
    rr = sub.add_parser("teste-reteste", help="incerteza de montagem em T1 repetidos")
    rr.add_argument("exportacao")
    rr.add_argument("--ensaios", required=True, help="códigos dos ensaios T1 repetidos, separados por vírgula")
    banda = sub.add_parser("banda", help="energia acima de 800 Hz numa captura a 3200 Hz")
    banda.add_argument("captura")
    banda.add_argument("--taxa", type=float, help="amostras/s da captura (padrão: a gravada pelo captura.py)")
    banda.add_argument("--ponto", default="A", choices=PONTOS)
    banda.add_argument("--eixo", default="z", choices=("x", "y", "z"))
    banda.add_argument("--espectro", help="grava o espectro (frequência, densidade) neste CSV")
    banda.add_argument("--grafico", help="grava o gráfico do espectro neste PNG")
    a = p.parse_args(argv)

    if a.comando in ("piso-ruido", "teste-reteste"):
        linhas = ler_exportacao(a.exportacao)
        if simulados(linhas):
            escrever("ATENÇÃO: o arquivo tem dados SIMULADOS; o resultado é teste da conta, não medição.")
        ensaios = [e.strip() for e in (a.ensaios or "").split(",") if e.strip()]
        if a.comando == "piso-ruido":
            imprimir_piso(piso_de_ruido(linhas, ensaios or None), escrever)
        else:
            if len(ensaios) < 2:
                p.error("o teste-reteste precisa de pelo menos dois ensaios")
            imprimir_reteste(*teste_reteste(linhas, ensaios), escrever=escrever)
        return 0

    taxa = a.taxa or taxa_da_captura(a.captura)
    if not taxa:
        p.error("a captura não diz a taxa; informe --taxa")
    sinal = ler_captura(a.captura, a.ponto, a.eixo)
    freq, psd = espectro(sinal, taxa)
    imprimir_banda(fracao_de_energia(freq, psd), taxa, a.ponto, a.eixo, len(sinal), escrever)
    if a.espectro:
        with open(a.espectro, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["frequencia_hz", "densidade_lsb2_por_hz"])
            w.writerows(zip(freq.round(3), psd))
    if a.grafico:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(9, 4))
        ax.semilogy(freq[1:], psd[1:])
        ax.axvspan(BANDA_ALTA_HZ[0], taxa / 2, alpha=0.15, label="acima de 800 Hz")
        ax.set_xlabel("frequência (Hz)")
        ax.set_ylabel("densidade (LSB²/Hz)")
        ax.set_title(f"Ponto {a.ponto}, eixo {a.eixo}, {taxa:.0f} Hz")
        ax.legend()
        fig.tight_layout()
        fig.savefig(a.grafico, dpi=120)
    return 0


if __name__ == "__main__":
    sys.exit(main())
