package br.senai.predictspin.seguranca;

/** Principal de uma requisição autenticada por dispositivo (cabeçalhos X-Dispositivo-*). */
public record DispositivoAutenticado(Long id, String identificador, Long maquinaId, boolean simulado) {
}
