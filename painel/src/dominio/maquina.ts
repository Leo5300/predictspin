/**
 * Textos da máquina e do dispositivo montados a partir da API, sem repetir informação.
 */

/** "ROMI Tormax 30" com fabricante "ROMI" vira só o modelo: o fabricante já está no nome. */
export function descricaoDoModelo(modelo: string, fabricante: string | null | undefined): string {
  const nomeDoFabricante = fabricante?.trim()
  if (!nomeDoFabricante) return modelo
  const repete = modelo
    .toLocaleLowerCase('pt-BR')
    .includes(nomeDoFabricante.toLocaleLowerCase('pt-BR'))
  return repete ? modelo : `${modelo} · ${nomeDoFabricante}`
}

/**
 * Último contato do dispositivo. A API grava o contato com resolução de 10 s (para não travar a
 * linha do dispositivo a cada janela); a janela recebida dele é um contato mais recente. Vale o
 * mais novo dos dois.
 */
export function ultimoContato(
  contatoGravado: string | null | undefined,
  janela: { dispositivo: string; recebido_em: string } | null | undefined,
  identificador: string,
): string | null {
  const daJanela = janela?.dispositivo === identificador ? janela.recebido_em : null
  if (!contatoGravado) return daJanela
  if (!daJanela) return contatoGravado
  return Date.parse(daJanela) > Date.parse(contatoGravado) ? daJanela : contatoGravado
}
