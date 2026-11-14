package br.senai.predictspin.catalogo.dto;

import java.time.Instant;

/**
 * 409 ao criar ou renomear para um nome que já existe (pelo nome normalizado): os campos do
 * ErroResposta mais o item existente, para o painel selecioná-lo.
 */
public record ConflitoCatalogoResposta(
        Instant timestamp,
        int status,
        String erro,
        String mensagem,
        String caminho,
        ItemCatalogoResposta existente) {
}
