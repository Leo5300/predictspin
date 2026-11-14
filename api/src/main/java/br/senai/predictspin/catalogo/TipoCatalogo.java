package br.senai.predictspin.catalogo;

/** Os dois catálogos da receita do corte. */
public enum TipoCatalogo {
    MATERIAL("Material"),
    FERRAMENTA("Ferramenta");

    private final String rotulo;

    TipoCatalogo(String rotulo) {
        this.rotulo = rotulo;
    }

    public String rotulo() {
        return rotulo;
    }
}
