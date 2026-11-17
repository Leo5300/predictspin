"""Imprime o build flag com o hash curto do commit, para a versão do firmware.

Usado pelo platformio.ini (build_flags com "!python ferramentas/versao_git.py"). Com mudança não
versionada dentro de firmware/, acrescenta "-mod". Sem git, não define nada e o firmware usa só a data
de Config.h.
"""
import subprocess


def rodar(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True, timeout=10).stdout.strip()


def main():
    try:
        commit = rodar("rev-parse", "--short=7", "HEAD")
        sujo = rodar("status", "--porcelain", "--", ".")
    except (OSError, subprocess.SubprocessError):
        return
    if sujo:
        commit += "-mod"
    print('-DFIRMWARE_COMMIT=\\"%s\\"' % commit)


if __name__ == "__main__":
    main()
