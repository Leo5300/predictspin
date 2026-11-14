/**
 * Nome de um canal auxiliar para a tela. A API dá só o código e a grandeza; três canais de
 * temperatura apareciam todos como "Temperatura". O local sai do próprio código do canal (as partes
 * do nome cadastrado na carga inicial: amb_temp_c, temp_cabecote_c, temp_ferramenta_c...), sem
 * inventar nada: código desconhecido fica só com a grandeza.
 */

const GRANDEZA: Record<string, string> = {
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  corrente: 'Corrente',
  tensao: 'Tensão',
  potencia: 'Potência',
}

/** Partes do código que dizem onde o canal mede, na ordem em que são procuradas. */
const LOCAIS: { parte: string; texto: string }[] = [
  { parte: 'amb', texto: 'ambiente' },
  { parte: 'cabecote', texto: 'do cabeçote' },
  { parte: 'ferramenta', texto: 'da ferramenta' },
  { parte: 'motor', texto: 'do motor' },
]

export function rotuloDoCanal(codigo: string, grandeza: string): string {
  const nome = GRANDEZA[grandeza] ?? grandeza.charAt(0).toUpperCase() + grandeza.slice(1)
  const partes = codigo.toLowerCase().split(/[^a-z0-9]+/)
  const local = LOCAIS.find((l) => partes.includes(l.parte))
  return local ? `${nome} ${local.texto}` : nome
}
