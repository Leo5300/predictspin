/**
 * Glossário do painel: o que aparece no balão "?" ao lado de cada termo técnico. Um professor ou um
 * técnico que nunca viu o painel entende cada número sem ninguém explicar.
 *
 * Os textos são fixos e não são medição. Os números dos exemplos são texto explicativo, sempre
 * começando por "Exemplo:", e não vêm da API: isso não fere a regra de nenhum valor inventado no
 * painel (todo número de medição exibido vem da API; estes são parte da explicação).
 */

export type Termo = {
  /** Título do balão e base do nome acessível ("O que é RMS?"). */
  titulo: string
  explicacao: string
  exemplo: string
}

export const GLOSSARIO = {
  g: {
    titulo: 'g',
    explicacao: 'Unidade de aceleração: 1 g é a aceleração da gravidade (9,8 m/s²).',
    exemplo: 'Exemplo: 0,05 g é 5% da gravidade, uma vibração pequena.',
  },
  rms: {
    titulo: 'RMS',
    explicacao:
      'Quanto o ponto vibrou, em média, na janela. É como os 127 V da tomada: a tensão sobe e desce o tempo todo, mas 127 V é o valor que representa o efeito real. É o principal indicador de "está vibrando mais que o normal".',
    exemplo: 'Exemplo: RMS de 0,045 g no ponto A = vibração média de 4,5% da gravidade.',
  },
  pico: {
    titulo: 'PICO',
    explicacao:
      'O maior valor instantâneo da janela. Pega pancadas curtas que o RMS dilui na média.',
    exemplo:
      'Exemplo: RMS 0,08 g e pico 0,24 g é comum. Se o pico salta e o RMS quase não muda, houve uma pancada isolada.',
  },
  curtose: {
    titulo: 'CURT (curtose)',
    explicacao:
      'Diz se a vibração é "lisa" ou cheia de pancadas. Até cerca de 3 é vibração sem pancadas (um giro bem regular fica até abaixo de 3); bem acima de 3 indica impactos, como uma batida ou um rolamento começando a falhar.',
    exemplo: 'Exemplo: curtose 2,5 = sem pancadas; curtose 8 = alguma coisa batendo.',
  },
  ordens: {
    titulo: '1X, 2X, 3X (ordens)',
    explicacao:
      'Quanto da vibração acontece no ritmo da rotação: 1X = uma vez por volta, 2X = duas vezes por volta, 3X = três. Ajuda a descobrir a causa.',
    exemplo:
      'Exemplo: a 1200 rpm, o 1X fica em 20 Hz. 1X crescendo sozinho costuma ser desbalanceamento; 2X alto costuma ser desalinhamento ou folga.',
  },
  rpm: {
    titulo: 'RPM (rotação)',
    explicacao:
      'Voltas por minuto da placa, medidas pelo sensor R (um pulso por volta). "Marcha mais próxima" é a rotação da tabela do torno mais perto da medida.',
    exemplo: 'Exemplo: 1120 rpm ≈ 18,7 voltas por segundo.',
  },
  janela: {
    titulo: 'Janela',
    explicacao:
      'Resumo de 5 segundos de sinal (1 s no AO VIVO). O painel não mostra o sinal bruto: cada janela vira RMS, pico, curtose e ordens.',
    exemplo:
      'Exemplo: 1600 leituras por segundo × 5 s = 8000 leituras viram um RMS, um pico e uma curtose.',
  },
  amostras: {
    titulo: 'Amostras',
    explicacao: 'Quantas leituras chegaram na janela, comparado com as esperadas.',
    exemplo:
      'Exemplo: 7.999 de 8.000 está bom; abaixo de 98% a janela é suspeita e fica fora do aprendizado.',
  },
  saturacao: {
    titulo: 'Saturação',
    explicacao:
      'O sensor bateu no limite da escala (±16 g) e o valor real pode ser maior que o medido.',
    exemplo:
      'Exemplo: uma pancada forte na bancada pode saturar; essa janela fica marcada e sai do aprendizado.',
  },
  referencia: {
    titulo: 'Referência',
    explicacao:
      'A faixa normal aprendida para cada ponto e cada rotação, a partir de gravações em operação normal. Enquanto ela não existe, o painel fica cinza: não há como dizer o que é anormal.',
    exemplo:
      'Exemplo: se o normal do ponto B a 1120 rpm fica entre 0,07 e 0,09 g, um RMS de 0,15 g passa a chamar atenção.',
  },
  desvio: {
    titulo: 'Desvio do RMS',
    explicacao: 'Quanto o RMS atual se afasta da referência. Sem referência, a régua fica vazia.',
    exemplo:
      'Exemplo: régua no meio = dentro do normal; régua avançando para a direita = vibrando acima do normal.',
  },
  dado_velho: {
    titulo: 'Dado velho',
    explicacao:
      'A última janela chegou há mais de 15 s (4 s no AO VIVO). O número na tela pode não ser mais o atual.',
    exemplo: 'Exemplo: Wi-Fi caiu; os valores ficam em cinza claro com "sem dados há 40 s".',
  },
  sim: {
    titulo: 'SIM (simulado)',
    explicacao:
      'Dado gerado por programa para testar o sistema, não medido no torno. Nunca se mistura com medição real e nunca entra no artigo.',
    exemplo: 'Exemplo: a faixa hachurada no topo avisa que tudo na tela é simulado.',
  },
  ao_vivo: {
    titulo: 'AO VIVO',
    explicacao:
      'Pede ao dispositivo janelas de 1 s por 2 minutos, para ver mudanças rápidas. Essas janelas não entram no aprendizado.',
    exemplo:
      'Exemplo: ao aproximar a ferramenta, dá para ver o RMS do ponto B reagir segundo a segundo.',
  },
  mapa: {
    titulo: 'Mapa de ordens',
    explicacao:
      'Cada linha é uma medida de um ponto (RMS, 1X, 2X, 3X); cada quadradinho é um intervalo de tempo, comparado com o típico daquela linha (o valor do meio no período, só na mesma marcha, porque trocar de marcha muda tudo). Tom igual = dentro de ±15% do típico; mais contraste = acima do típico; pontilhado = abaixo; tracejado = lacuna. Máquina saudável = tapete liso.',
    exemplo:
      'Exemplo: só as linhas do ponto B ganhando contraste desde 17:02 indica mudança no corte, não no motor.',
  },
  cobertura: {
    titulo: 'Cobertura',
    explicacao:
      'Quantas gravações válidas existem em cada combinação de etapa, condição e rotação, contra a meta.',
    exemplo: 'Exemplo: "2/3" na célula T1 · 450 rpm = falta uma gravação.',
  },
  receita: {
    titulo: 'Receita do corte',
    explicacao:
      'Como a peça foi trabalhada (material, ferramenta, avanço, profundidade, diâmetro, fluido). Serve para comparar só gravações feitas do mesmo jeito.',
    exemplo:
      'Exemplo: corte em aço com avanço 0,10 mm/volta não é comparado com corte em alumínio com avanço 0,30.',
  },
} as const satisfies Record<string, Termo>

export type ChaveDoGlossario = keyof typeof GLOSSARIO

export const CHAVES_DO_GLOSSARIO = Object.keys(GLOSSARIO) as ChaveDoGlossario[]

/** Nome acessível do botão "?": "O que é RMS?". */
export function nomeDoBotao(chave: ChaveDoGlossario): string {
  return `O que é ${GLOSSARIO[chave].titulo}?`
}
