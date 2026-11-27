package br.senai.predictspin.demo;

/** Nível da vibração simulada da barra de demonstração. PARADA = o gerador não envia janela. */
public enum NivelDemo {
    PARADA,
    NORMAL,
    ATENCAO,
    ALARME;

    /** ATENÇÃO e ALARME voltam sozinhos a NORMAL depois de {@code ps.demo.volta-normal-s}. */
    public boolean volta() {
        return this == ATENCAO || this == ALARME;
    }
}
