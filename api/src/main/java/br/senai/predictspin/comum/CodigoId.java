package br.senai.predictspin.comum;

/** Projeção mínima usada para resolver códigos (ponto "A", canal "corrente_a") em identificadores. */
public interface CodigoId {

    String getCodigo();

    Long getId();
}
