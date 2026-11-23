"""
Gera o ícone do app (no lugar do ícone do modelo do Expo): um anel de mostrador e três traços,
contínuo, tracejado e pontilhado, como os pontos A, B e C. Grafite e cinza dos tokens; nada de cor
de estado. Uso: python scripts/gerar-icone.py (precisa do Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

PASTA = Path(__file__).resolve().parent.parent / "assets" / "images"
GRAFITE = (46, 46, 46, 255)  # --acao do tema claro
CINZA = (209, 209, 209, 255)  # --superficie-fundo do tema claro
LADO = 1024


def motivo(desenho: ImageDraw.ImageDraw, cor, escala: float, centro=LADO / 2):
    """Anel e três traços dentro de um quadro de LADO * escala, centrado."""
    r = 300 * escala
    espessura = max(2, round(44 * escala))
    desenho.ellipse((centro - r, centro - r, centro + r, centro + r), outline=cor, width=espessura)
    largura = 330 * escala
    x0 = centro - largura / 2
    traco = max(2, round(36 * escala))
    for i, estilo in enumerate(("continua", "tracejada", "pontilhada")):
        y = centro + (i - 1) * 110 * escala
        if estilo == "continua":
            desenho.rectangle((x0, y - traco / 2, x0 + largura, y + traco / 2), fill=cor)
        elif estilo == "tracejada":
            passo = largura / 3.62  # o último traço termina junto com os outros dois
            for k in range(4):
                a = x0 + k * passo
                desenho.rectangle((a, y - traco / 2, a + passo * 0.62, y + traco / 2), fill=cor)
        else:
            n = 7
            for k in range(n):
                cx = x0 + traco / 2 + k * (largura - traco) / (n - 1)
                desenho.rectangle((cx - traco / 2, y - traco / 2, cx + traco / 2, y + traco / 2), fill=cor)


def salvar(nome: str, fundo, cor, escala: float):
    imagem = Image.new("RGBA", (LADO, LADO), fundo)
    motivo(ImageDraw.Draw(imagem), cor, escala)
    imagem.save(PASTA / nome)


transparente = (0, 0, 0, 0)
salvar("icon.png", GRAFITE, CINZA, 1.0)
# Android adaptativo: o desenho fica dentro da zona segura (cerca de 66% do quadro)
salvar("android-icon-foreground.png", transparente, CINZA, 0.62)
Image.new("RGBA", (LADO, LADO), GRAFITE).save(PASTA / "android-icon-background.png")
salvar("android-icon-monochrome.png", transparente, (255, 255, 255, 255), 0.62)
salvar("splash-icon.png", transparente, GRAFITE, 1.0)
print("Ícones gerados em", PASTA)
