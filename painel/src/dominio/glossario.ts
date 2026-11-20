/**
 * Glossário do painel: o que aparece no balão "?" ao lado de cada termo técnico. Um professor ou um
 * técnico que nunca viu o painel entende cada número sem ninguém explicar.
 *
 * Os textos são fixos e não são medição. Os números dos exemplos são texto explicativo, sempre
 * começando por "Exemplo:", e não vêm da API: isso não fere a regra de nenhum valor inventado no
 * painel (todo número de medição exibido vem da API; estes são parte da explicação). Limites da regra
 * de alarme NUNCA são escritos aqui: aparecem como {z_atencao}, {z_alarme}, {atraso_s} e {saida_s} e o
 * balão os troca pelos valores em uso lidos da API.
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
      'O normal desta máquina, aprendido de gravações boas: a vibração típica de cada ponto em cada marcha. Sem referência, o painel não chama nada de atenção ou alarme.',
    exemplo:
      'Exemplo: a referência do B na marcha 1120, no corte, diz que o RMS costuma ficar perto de 0,08 g.',
  },
  desvio: {
    titulo: 'Desvio (z)',
    explicacao:
      "Quanto o valor de agora se afastou do normal, contado em 'tamanhos da variação normal'. Abaixo de {z_atencao} é variação comum; a partir de {z_atencao} é atenção; a partir de {z_alarme} é alarme.",
    exemplo: 'Exemplo: z = 4 no B·RMS quer dizer bem acima do normal, mas ainda não alarme.',
  },
  atencao_alarme: {
    titulo: 'Atenção e alarme',
    explicacao:
      'Atenção: saiu do normal e vale olhar. Alarme: saiu muito e tem uma ação recomendada. Os dois só entram depois de {atraso_s} s seguidos fora do normal, para uma batida isolada não disparar nada, e só apagam depois de {saida_s} s de volta ao normal.',
    exemplo: 'Exemplo: o B ficou {atraso_s} s acima de {z_alarme} e o alarme acendeu.',
  },
  reconhecer: {
    titulo: 'Reconhecer',
    explicacao:
      "Dizer ao sistema 'eu vi'. Não apaga o alarme nem conserta nada: ele só some quando a vibração volta ao normal.",
    exemplo: 'Exemplo: o técnico reconhece e vai conferir a ferramenta.',
  },
  suprimido: {
    titulo: 'Suprimido',
    explicacao: 'Alarme silenciado de propósito, com motivo e prazo, por quem pode.',
    exemplo:
      'Exemplo: suprimido por 1 h porque a máquina ao lado está em manutenção e faz o C vibrar.',
  },
  severidade: {
    titulo: 'Severidade acumulada',
    explicacao:
      'Soma de quanto e por quanto tempo um ponto ficou acima do normal. Duas máquinas com as mesmas horas de uso podem ter severidades bem diferentes.',
    exemplo: 'Exemplo: 10 min um pouco acima pode pesar mais que 10 s muito acima.',
  },
  acao_recomendada: {
    titulo: 'Ação recomendada',
    explicacao:
      'O que conferir primeiro quando o alarme acende. É orientação de inspeção, não diagnóstico.',
    exemplo: "Exemplo: 'conferir o estado da ferramenta e reduzir o avanço'.",
  },
  deriva: {
    titulo: 'Deriva',
    explicacao:
      'Quanto o normal recente se afastou da referência gravada, devagar, ao longo dos dias. Pode ser desgaste começando ou só mudança de uso.',
    exemplo: 'Exemplo: deriva de +12% no A em uma semana.',
  },
  referencia_generica: {
    titulo: 'Referência genérica',
    explicacao:
      'Não havia gravação suficiente com este material e esta ferramenta, então o painel comparou com o corte normal desta marcha, de todas as receitas juntas.',
    exemplo: 'Exemplo: material novo, ainda sem gravações.',
  },
  sem_referencia_completa: {
    titulo: 'Sem referência completa',
    explicacao:
      'Para avaliar o torno girando fora de uma gravação, o painel precisa saber o normal do giro em vazio e o do corte nesta marcha. Falta um dos dois.',
    exemplo: 'Exemplo: há gravação em vazio a 1120 rpm, mas nenhuma de corte.',
  },
  calibracao_diferente: {
    titulo: 'Calibração diferente',
    explicacao:
      'O sensor foi calibrado de novo depois que a referência foi gravada, então os números não são mais comparáveis. Recalcule a referência.',
    exemplo: 'Exemplo: o sensor B foi recalibrado ontem.',
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
  modelo: {
    titulo: 'Modelo',
    explicacao:
      'Um programa que aprendeu com gravações rotuladas. Aqui ele é segunda opinião: quem acende atenção e alarme continua sendo a comparação com o normal.',
    exemplo: "Exemplo: o alarme acendeu e o modelo diz 'avanço excessivo'.",
  },
  escore_anomalia: {
    titulo: 'Escore de anomalia',
    explicacao:
      'O quanto a janela parece diferente de tudo o que foi gravado como normal. Acima do limite, o modelo também vê anomalia.',
    exemplo: 'Exemplo: escore alto com o alarme aceso reforça que há algo fora do normal.',
  },
  classe_provavel: {
    titulo: 'Classe provável e confiança',
    explicacao:
      "O tipo de situação que mais se parece com a de agora, entre as que foram gravadas, e quanto o modelo aposta nela. Abaixo de {confianca_min}% o painel mostra 'classe incerta'.",
    exemplo: 'Exemplo: avanço excessivo, 78%.',
  },
  validacao_ensaio: {
    titulo: 'Validação por ensaio',
    explicacao:
      'O modelo é testado em gravações inteiras que ele não viu no treino. Testar em pedaços da mesma gravação daria nota alta demais.',
    exemplo: 'Exemplo: treinou com 4 gravações de avanço excessivo e foi testado na 5ª.',
  },
  matriz_confusao: {
    titulo: 'Matriz de confusão',
    explicacao:
      'Tabela que mostra, para cada situação real, o que o modelo respondeu. A diagonal são os acertos.',
    exemplo:
      'Exemplo: de 30 janelas de ferramenta desgastada, 24 foram reconhecidas e 6 foram chamadas de avanço excessivo.',
  },
  recall: {
    titulo: 'Recall',
    explicacao: 'De todas as janelas de uma situação, quantas o modelo reconheceu.',
    exemplo: 'Exemplo: recall de 80% em desbalanceamento quer dizer que 8 em cada 10 foram reconhecidas.',
  },
  versao_ativa: {
    titulo: 'Versão ativa',
    explicacao:
      'O modelo que está rodando agora. Um treino novo só passa a valer quando alguém com permissão ativa.',
    exemplo: 'Exemplo: v4 treinada hoje, v3 ainda ativa.',
  },
  tendencia: {
    titulo: 'Tendência',
    explicacao:
      'Se uma medida vem subindo dia após dia, o painel estima quando ela cruzaria o limite, sempre com uma faixa de incerteza. Não é data de quebra.',
    exemplo: 'Exemplo: se continuar assim, entre 20 e 45 dias.',
  },
} as const satisfies Record<string, Termo>

export type ChaveDoGlossario = keyof typeof GLOSSARIO

export const CHAVES_DO_GLOSSARIO = Object.keys(GLOSSARIO) as ChaveDoGlossario[]

/** Valores em uso que os textos citam entre chaves; vêm da API (GET /alarmes/limites), nunca à mão. */
export type ValoresDoGlossario = {
  z_atencao: number
  z_alarme: number
  atraso_s: number
  saida_s: number
  /** ps.modelo.confianca-min, em % */
  confianca_min: number
}

/** Troca {nome} pelo valor em uso; sem os valores (ainda carregando), mostra "…". */
export function interpolar(texto: string, valores: ValoresDoGlossario | undefined): string {
  return texto.replace(/\{(\w+)\}/g, (_, nome: string) => {
    const valor = valores?.[nome as keyof ValoresDoGlossario]
    return valor === undefined ? '…' : valor.toLocaleString('pt-BR')
  })
}

/** O termo usa algum valor da API? */
export function usaValores(chave: ChaveDoGlossario): boolean {
  const termo = GLOSSARIO[chave]
  return /\{\w+\}/.test(termo.explicacao + termo.exemplo)
}

/** Nome acessível do botão "?": "O que é RMS?". */
export function nomeDoBotao(chave: ChaveDoGlossario): string {
  return `O que é ${GLOSSARIO[chave].titulo}?`
}
