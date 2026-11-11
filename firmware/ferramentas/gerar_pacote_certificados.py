"""Gera firmware/data/cert/x509_crt_bundle.bin, o pacote de certificados raiz usado no HTTPS.

O núcleo Arduino-ESP32 2.0.17 (plataforma espressif32 7.1.3) traz o verificador do pacote
(WiFiClientSecure::setCACertBundle), mas não o pacote. O formato é o do ESP-IDF 4.4, base desse
núcleo: 2 bytes com o número de certificados e, para cada um, em ordem crescente do nome do titular
(DER), 2 bytes do tamanho do nome, 2 bytes do tamanho da chave pública, o nome e a chave pública
(SubjectPublicKeyInfo em DER). Só nome e chave vão no pacote: é o que o ESP32 usa para conferir a
assinatura do topo da cadeia que o servidor apresenta.

Entrada: o arquivo cacrt_all.pem do ESP-IDF 4.4 (raízes da Mozilla), em
https://github.com/espressif/esp-idf/blob/release/v4.4/components/mbedtls/esp_crt_bundle/cacrt_all.pem

Uso (a partir de firmware/):
    pip install cryptography==46.0.3
    python ferramentas/gerar_pacote_certificados.py CAMINHO/cacrt_all.pem data/cert/x509_crt_bundle.bin
"""
import argparse
import struct
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import serialization


def gerar(certificados):
    """Bytes do pacote no formato do esp_crt_bundle do ESP-IDF 4.4."""
    ordenados = sorted(certificados, key=lambda c: c.subject.public_bytes())
    pacote = bytearray(struct.pack(">H", len(ordenados)))
    for cert in ordenados:
        nome = cert.subject.public_bytes()
        chave = cert.public_key().public_bytes(serialization.Encoding.DER,
                                               serialization.PublicFormat.SubjectPublicKeyInfo)
        pacote += struct.pack(">HH", len(nome), len(chave))
        pacote += nome
        pacote += chave
    return bytes(pacote)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("pem", type=Path, help="arquivo PEM com os certificados raiz (cacrt_all.pem)")
    p.add_argument("saida", type=Path, help="arquivo .bin a gerar")
    a = p.parse_args()

    certificados = x509.load_pem_x509_certificates(a.pem.read_bytes())
    if not certificados:
        sys.exit("nenhum certificado encontrado em " + str(a.pem))
    pacote = gerar(certificados)
    a.saida.parent.mkdir(parents=True, exist_ok=True)
    a.saida.write_bytes(pacote)
    print(f"{len(certificados)} certificados, {len(pacote)} bytes em {a.saida}")


if __name__ == "__main__":
    main()
