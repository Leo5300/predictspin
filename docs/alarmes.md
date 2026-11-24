# Referência, alarmes e ordem de serviço

Como o PredictSpin decide que um ponto saiu do normal, como isso vira alerta no padrão ISA-18.2 e
quando abre ordem de serviço (OS). É a parte A da inteligência do sistema: tudo aqui é regra
estatística em Java, sem modelo de aprendizado de máquina (Isolation Forest, Random Forest e ONNX são
a parte B).

> **Todos os números desta página são PROPOSTA a confirmar com dado real.** Eles ficam em
> `api/src/main/resources/application.yml` (prefixos `ps.referencia`, `ps.alarme` e `ps.os`), são
> servidos por `GET /api/v1/alarmes/limites` e aparecem no Diagnóstico. O painel nunca os escreve à
> mão: até os textos do "?" interpolam os valores vindos da API. Com dado simulado, o que está aqui
> prova o **encadeamento**, não a detecção real: limites e referência só valem depois dos ensaios
> T0–T3 no torno.

## Visão geral

```
janela (POST /telemetria) ─► filtro de qualidade ─► avaliação contra a referência (z por medida)
        │                                              │
        │                                              ├─► estado do ponto (atraso e histerese)
        │                                              ├─► severidade acumulada (z·s por dia)
        │                                              └─► alerta de instrumento
        ▼                                              ▼
   gravada junto                         alerta ISA-18.2 ─► ordem de serviço ─► retorno do técnico
```

A janela é gravada primeiro, na transação da ingestão, e a resposta do `POST /api/v1/telemetria` sai logo
depois do commit. A avaliação (estado, alerta, OS) roda **depois da resposta**, na fila de avaliação da máquina
(`FilaDeAvaliacao`, desde 19/11/2026): uma thread por máquina e tipo de dado, que preserva a ordem de chegada,
avalia em transação própria e só então manda a janela ao fluxo ao vivo, já avaliada. A fila é curta
(`ps.avaliacao.fila-max`, 64 janelas); cheia, o POST espera até `ps.avaliacao.espera-fila-ms` (2000 ms) por
uma vaga e, se ela não abrir, a janela fica gravada sem avaliação e é contada ("Descartadas da fila" no
Diagnóstico, `avaliacoes_descartadas`). Se a avaliação falhar, a transação dela é desfeita inteira, a janela
continua gravada e o erro vai para o log e para o contador "Sem avaliação por erro" (`falhas_avaliacao`, desde
que a API subiu). A janela que ficou sem avaliação não é reavaliada depois; a seguinte é avaliada normalmente.
Os eventos ao vivo (`alerta`, `os`) saem depois do commit da avaliação. A janela recuperada (mais de 30 s de
idade) continua tratada como antes: o "ao vivo" é decidido na chegada, não na hora da avaliação.

Por que fora da resposta: com a avaliação na thread do pedido, metade do tempo da resposta era avaliação, as
avaliações da mesma máquina faziam fila na trava das linhas de `estado_ponto` e o pool de conexões chegava a
ter todas as conexões ocupadas e outras 10 threads esperando (medição em
[`teste-de-carga.md`](teste-de-carga.md#avaliação-fora-do-caminho-da-resposta-19112026)).

Uma primeira versão rodava a avaliação no `afterCommit` da ingestão. Nesse ponto o Spring ainda não
devolveu a conexão da ingestão, e a transação da avaliação pegava uma segunda: com 20 VUs no k6 e pool de
10 conexões, as threads esperavam a segunda conexão até o prazo de 30 s do pool (24% de falhas numa
execução de 60 s em 18/11/2026). Por isso a avaliação saiu de dentro do ciclo da transação.

## Filtro de qualidade

Função única (`FiltroQualidade`), reusada pela parte B no treino. Uma janela é **ruim** quando:

| Motivo | Regra |
|---|---|
| `saturou` | algum acelerômetro chegou ao fundo de escala |
| `modo_rapido` | janela de 1 s (estatística diferente da de 5 s) |
| `amostras_faltando` | menos de `amostras-min-fracao` (98%) das amostras esperadas |
| `fora_da_marcha` | rotação > 0 fora de ±`tolerancia-marcha` (10%) da marcha mais próxima |
| `ordens_zeradas` | 1X, 2X e 3X iguais a 0 com rotação > 0 (primeira janela depois de ligar ou trocar de marcha) |
| `ensaio_descartado` | o ensaio foi descartado |

**Marcha** = a rotação nominal da placa mais próxima da medida (`rotacoes_nominais_rpm`; empate fica
com a menor; 0 com o torno parado; sem rotações cadastradas, a própria rotação arredondada).

## Seleção para a referência

Separada do filtro. Entram as janelas boas de ensaios com condição **normal** (nunca `sensor_solto` nem
as outras condições; motivo `condicao_nao_normal`). **T2 não tem referência própria** (motivo
`etapa_t2`): as janelas de T2 são avaliadas contra a do T1 da mesma marcha.

**Calibração.** Calibrar o sensor muda os valores em g em cerca de 7%. Em cada ponto vale a calibração
da janela boa mais recente; as janelas do ponto com outra calibração ficam de fora (motivo
`calibracao_antiga`, contado por janela × ponto). Cada célula guarda a calibração e as versões de
firmware das janelas usadas.

## Referência

**Célula** = máquina × tipo de dado (real ou simulado) × ponto × medida × marcha × etapa (T0, T1, T3).
No T3 existe também a célula da **receita** (par material + ferramenta do ensaio); avanço, profundidade,
diâmetro e fluido ficam gravados no ensaio, mas não separam a referência (para não fragmentar demais).
A **T3 genérica** da marcha junta todas as receitas. Medidas: `rms_g`, `pico_g`, `curtose`, `o1x`,
`o2x`, `o3x`, `vel_rms_mm_s` (as ordens não existem no T0).

Estatística robusta: **mediana**, **σ = 1,4826 × MAD** (desvio absoluto mediano; o fator torna o σ
comparável ao desvio-padrão numa distribuição normal), **n** e **p95** (interpolação linear). Célula com
menos de `min-janelas` (24 = 2 min a 5 s) fica **insuficiente** e não gera z.

**σ efetivo** = o maior entre:

1. o σ da célula;
2. para `rms_g`, `pico_g` e `vel_rms_mm_s`, o **piso de ruído** do mesmo ponto e tipo de dado: o p95
   da medida nos ensaios T0 (só quando o T0 do ponto tem janelas suficientes);
3. `sigma-min-fracao` (0,05) × mediana.

Motivo: em marcha baixa o σ fica minúsculo e qualquer ruído viraria z alto. Sem T0 gravado vale (3), e o
Diagnóstico avisa "sem piso de ruído medido".

**z** = (x − mediana) / σ efetivo. σ efetivo igual a 0 não gera z.

**Versões.** "Recalcular referência" (`POST /api/v1/maquinas/{id}/referencias/recalcular?simulado=`,
ADMIN e TECNICO) grava uma versão nova e imutável, com data, autor, janelas usadas e excluídas por
motivo; a anterior fica guardada (`GET .../referencias/versoes`). `GET .../referencias` devolve a versão
em uso, as células e a cobertura (com / insuficiente / sem) por marcha e etapa, pelo RMS de todos os
pontos ativos. A versão em uso fica em memória por máquina e tipo de dado e é trocada no commit do
recálculo.

**Deriva** (`deriva.habilitada`, ligada por padrão). No recálculo entram também janelas boas de **uso
sem ensaio** dos últimos `deriva.dias` (7) que foram avaliadas NORMAL, sem alerta aberto na máquina no
instante da janela, na mesma célula da referência que as avaliou, limitadas a `deriva.fracao-maxima`
(30%) das janelas da célula (as mais recentes primeiro; d ≤ f/(1−f) × n). Nunca entram em célula de
receita. Além disso, só entram janelas com z abaixo do limite de atenção em **todas** as medidas: a
janela com z de atenção ou mais fica fora mesmo quando o ponto ainda está NORMAL por causa do atraso.
z negativo (vibração abaixo do típico) entra: é janela normal. Consequência aceita: fora de ensaio, um
giro em vazio comparado com o corte (ver "Limitações") entra na célula do corte com z negativo e puxa um
pouco o típico dele para baixo, no máximo até a fração acima. No Diagnóstico, a deriva de cada ponto é a
mediana de RMS ÷ típico das janelas de uso NORMAL das últimas 24 h (mesmo critério de z), menos 1, em %.

## Avaliação de cada janela

Uma linha por janela e ponto em `avaliacao` (z de cada medida em `real`, 4 bytes), só quando há
referência. Situações: `avaliada`, `sem_referencia`, `sem_referencia_completa`,
`calibracao_diferente`, `nao_avaliavel` (saturou, amostras faltando ou fora da marcha). Medidas de
ordem não são avaliadas com o torno parado nem quando vieram zeradas.

**Qual referência usar:**

- **Dentro de ensaio aberto:** a da etapa (T2 usa T1). No T3, a da receita se a célula do RMS da
  receita é suficiente; senão a T3 genérica, e a avaliação fica marcada **referência genérica**.
- **Sem ensaio (uso em aula):** rotação 0 → T0. Girando → compara com o T1 e com a T3 genérica da
  mesma marcha e fica com a de **menor pior z** (a interpretação mais normal): só sai do normal se a
  janela não parecer nem giro em vazio nem corte normal. Se faltar uma das duas, o ponto fica **sem
  referência completa** (sem estado), porque comparar o corte só com o giro em vazio alarmaria todo
  corte. Consequência visível: uma janela de giro em vazio aparece "comparada com o corte" com z
  negativo, e o estado é NORMAL do mesmo jeito.
- **Calibração diferente:** a janela só é comparada quando ela e a referência têm a **mesma** calibração
  naquele ponto, ou quando **nenhuma das duas** traz identificador. Se só um dos lados tem identificador (o
  sensor foi calibrado depois da referência, ou o firmware deixou de informar) ou se os dois têm e diferem, o
  ponto fica `calibracao_diferente`, não gera estado nem alerta, e o Diagnóstico pede recalcular. (Até
  19/11/2026 a comparação era pulada quando um dos lados não tinha calibração.)

**Estado do ponto** pela pior medida entre `rms_g`, `vel_rms_mm_s`, `o1x`, `o2x`, `o3x` e `pico_g` (a
curtose entra só na explicação). Só desvio **para cima** gera estado.

| Parâmetro | Valor (proposta) | Regra |
|---|---|---|
| `ps.alarme.z-atencao` | 3 | ATENÇÃO com z ≥ 3 |
| `ps.alarme.z-alarme` | 5 | ALARME com z ≥ 5 |
| `ps.alarme.atraso-s` | 15 s | só entra no estado depois de 15 s seguidos acima do limite |
| `ps.alarme.histerese-z` | 1 | só sai com z abaixo do limite − 1... |
| `ps.alarme.saida-s` | 15 s | ...por 15 s seguidos |

Tempos em segundos pelo `medido_em` das janelas (uma condição que começou na janela t0 e continua na
janela t durou (t − t0) + duração da janela): no modo rápido a janela é de 1 s. De ALARME o ponto desce
para ATENÇÃO se z ainda está na faixa de atenção (com a histerese), senão para NORMAL. Janela sem
avaliação conta como "fora do desvio" (não sobe e ajuda a sair). Mais que max(atraso, saída) + duas
janelas sem janela zera os temporizadores. Estado da máquina = pior estado entre os pontos.

**Explicação:** as 3 medidas/pontos de maior z, em texto pronto ("B·RMS 4,2σ acima do típico da marcha
1120"). Quando só um ponto saiu do normal, acrescenta "Se só este ponto mudou, confira também a fixação
do sensor." `GET /api/v1/maquinas/{id}/avaliacao` dá o detalhe da última janela (z, típico, % e σ efetivo da célula
usada, em cada medida; com o σ efetivo e os limites em z, o app desenha a faixa normal na unidade da medida:
típico ± z-atenção × σ, alarme em típico + z-alarme × σ); cada ponto das janelas (listas, última janela e evento `janela`) traz a avaliação compacta, e a
série agregada traz o maior z de cada intervalo (`z_max`), usado pelo mapa de ordens.

**Severidade acumulada:** S += max(0, zMax − z-atenção) × duração da janela (z·s), por ponto e dia em
`severidade_acumulada`, e um contador "desde a última OS" em `estado_ponto`. Janela de ensaio de
condição não soma.

**Janelas antigas** (fila do firmware, mais de 30 s de idade): são avaliadas e gravadas, mas não abrem
alerta ao vivo nem OS. Uma janela fora de ordem (medido_em anterior à última processada no ponto) é
gravada com o nível bruto e não mexe no estado; as em ordem andam o estado normalmente. Se o ponto
continuar fora do normal, o alerta abre na primeira janela ao vivo.

## Alerta de instrumento × alerta de máquina [PROPOSTA]

Alerta de **instrumento** (sensor solto, caído ou com defeito), prioridade baixa, abre quando, por
`instrumento-s` (30 s):

- o ponto some do envio (o firmware tira do payload o sensor que falha) enquanto a máquina envia os
  outros pontos; ou
- num ponto só, com rotação > 0 e os outros pontos sem queda, RMS **e** 1X abaixo de `sinal-fracao`
  (50%) do típico (fora de ensaio, o típico do giro em vazio); ou
- saturação ou amostras faltando se repetem em 30 s **no mesmo sensor**. O alerta vai para o ponto que
  mandou `pontos.*.saturou = true` ou cujas `pontos.*.amostras` ficaram abaixo de 98% das esperadas
  (campos opcionais por ponto, 19/11/2026). Quando o envio só traz o `saturou` e as `amostras` da janela
  inteira (como o firmware de 17/11/2026, que não foi alterado), a API não tem como saber o sensor: fica com
  o ponto de maior pico, e o motivo do alerta diz "o envio não diz qual sensor".

Nos três casos o alerta vai para o ponto que sumiu, caiu ou falhou, nunca para outro (testes em
`AlertaIntegracaoTest`: `instrumentoAbreComAcaoDoSensorENormaliza`, `instrumentoPorSinalCaidoVaiParaOPontoQueCaiu`,
`instrumentoPorSaturacaoVaiParaOSensorQueSaturou`, `instrumentoPorAmostrasDoSensorVaiParaOSensorComFalta` e
`saturacaoSoDaJanelaFicaComOMaiorPicoEDizIsso`).

Normaliza depois de `saida-s` sem nenhuma das condições. Não abre OS: a ação já é conferir o sensor.
Desvio só para cima num ponto só continua sendo alerta de **máquina** (o corte afeta principalmente o
B), com a dica de conferir a fixação. **A validação real fica para os ensaios com rótulo
`sensor_solto`**: com dado simulado, só o encadeamento foi testado.

## Alertas no padrão ISA-18.2

Um alerta abre quando o ponto **entra** em ATENÇÃO ou ALARME (depois do atraso) e é atualizado se
piorar; não abre um por janela. Um alerta ativo por ponto, tipo (máquina ou instrumento) e tipo de dado.

| Estado | Como chega | Sai para |
|---|---|---|
| `ativo_nao_reconhecido` | abriu | reconhecido (alguém reconheceu) ou normalizado (voltou ao normal) |
| `ativo_reconhecido` | reconheceram | encerrado (voltou ao normal) |
| `normalizado_nao_reconhecido` | voltou ao normal sem reconhecimento | encerrado (alguém reconheceu) |
| `encerrado` | — | — (se sair de novo do normal, abre outro) |
| `suprimido` | ADMIN, com motivo e prazo | ao fim do prazo (ou cancelado), o estado que teria sem a supressão |

**Prioridade:** ATENÇÃO = baixa, ALARME = alta, instrumento = baixa (gravada na coluna `severidade` da
V1). Ela segue o nível ATUAL: o alerta que caiu de alarme para atenção volta a baixa; o pior nível alcançado
fica em `pior_nivel` e o maior z em `pior_z`. Durante a supressão a regra continua: se o ponto volta ao normal e sai de novo, é o mesmo alerta
(histórico "piorou"). Cada alerta guarda máquina, ponto, tipo, prioridade, nível atual e o pior, janela
de origem, explicação, ação recomendada, componente provável, versão da referência, firmware e
calibração da janela, ensaio e condição, simulado, quem reconheceu e quando, e o histórico de cada
mudança (`alerta_historico`).

**Ação recomendada** (obrigatória: alarme sem ação definida é evento, não alarme), semeada na V7 por papel
do ponto × medida dominante; é orientação de inspeção, não diagnóstico:

| Ponto | Medida dominante | Ação |
|---|---|---|
| A (acionamento) | 1X | Conferir a fixação e o balanceamento da peça na placa. Se continuar sem peça, pedir ao técnico para verificar o mancal do eixo-árvore. |
| A | 2X | Conferir com o técnico o alinhamento e o aperto do conjunto do cabeçote e da placa. |
| A | 3X, RMS, velocidade, pico | Conferir folgas e parafusos soltos no cabeçote e na placa. |
| B (ferramenta) | 1X | Conferir a fixação da peça na placa e quanto ela fica para fora da placa (balanço). |
| B | RMS, velocidade, pico, 2X, 3X | Conferir o estado da ferramenta (desgaste ou lasca) e reduzir o avanço ou a profundidade de corte. |
| C (estrutura) | qualquer | Conferir se há outra máquina próxima ligada e o aperto da base e dos pés do torno. |
| instrumento | qualquer | Conferir a fixação do sensor {ponto} (ímã, superfície, cabo puxando ou solto) antes de agir na máquina. |

Componente provável (tabela `componente`): A = eixo-árvore e mancal dianteiro; B = ferramenta e
porta-ferramenta; C = estrutura e base.

**Ensaio de condição** (ensaio aberto com condição diferente de "normal", como avanço excessivo): a
avaliação e as cores aparecem e o alerta abre marcado "durante ensaio de {condição}", mas não abre OS,
não soma severidade e não entra nos indicadores.

**Rotas:** `GET /api/v1/alertas` (filtros máquina, estado, ponto, prioridade, tipo, simulado,
período; paginado, não reconhecidos primeiro), `GET /api/v1/alertas/{id}` (com histórico),
`POST .../reconhecer` (qualquer usuário), `POST .../suprimir` e `.../cancelar-supressao` (ADMIN),
`GET /api/v1/alarmes/limites`, `GET /api/v1/maquinas/{id}/alarmes/diagnostico`. Evento SSE `alerta`
com a ação (abriu, piorou, normalizou, reconhecido, suprimido, supressao_encerrada, encerrado).

## Indicadores de desempenho (Diagnóstico)

Últimas `indicadores-h` horas (24), sem os alertas de ensaio de condição: alertas por hora (média), pior
intervalo de `rajada-min` minutos (10), pontos repetitivos (o mesmo alerta aberto ou reaberto
`repetitivo-vezes` vezes ou mais (3) num intervalo de `rajada-min`), parados (ativos há mais de
`parado-h` horas, 24) e suprimidos. A calibração diferente e a deriva do Diagnóstico usam o mesmo
período. Os prazos de supressão oferecidos no painel são `supressao-opcoes-min` (15 min, 1 h, 4 h e
1 dia) e a API recusa (400) prazo acima de `supressao-max-min` (10080 min, uma semana). Todos ficam em
`ps.alarme` no `application.yml`, saem na rota de limites e aparecem no Diagnóstico; o painel não
escreve nenhum deles à mão. **Referência de leitura:** a EEMUA 191 e a ISA-18.2 citam cerca de 6 alarmes por hora
por operador como aceitável. Isto não é afirmação de conformidade com a norma.

## Ordem de serviço

Toda OS nasce de um **alerta de máquina ativo e não suprimido** (o alerta de origem nunca é nulo). Com esse
alerta, abre sozinha quando:

- o ponto fica em ALARME por `ps.os.alarme-continuo-s` (120 s) seguidos, contados só em janelas ao vivo; ou
- a severidade do ponto que dispara OS passa de `ps.os.severidade-limite` (600 z·s, cerca de 5 min com
  z = 5) desde a última OS daquele ponto (o contador recomeça).

**Os dois contadores só andam** em janela ao vivo (nunca na recuperada, mais de 30 s de idade), fora de
ensaio de condição, com o ponto em ATENÇÃO ou ALARME **depois do atraso** e com o alerta de máquina ativo e
não suprimido. Fora disso o tempo de ALARME recomeça e a severidade não soma. Severidade alta durante o
atraso (por exemplo, uma batida de 10 s) não conta para a OS. A tabela diária `severidade_acumulada`
(histórico de saúde, no Diagnóstico) continua somando toda janela avaliada, inclusive no atraso e as
recuperadas: são dois números diferentes, de propósito. Um alerta gera no máximo uma OS (restrição da V1);
no máximo uma OS aberta (ou em andamento) por ponto e tipo de dado. Alerta de instrumento não abre OS. Campos: número (OS-ano-sequência), máquina, ponto,
componente, alerta de origem, motivo, explicação, ação recomendada, severidade acumulada no momento,
versões, simulado, responsável e o **retorno do técnico** ao concluir: `confirmada` (havia problema) ou
`rejeitada` (falso positivo), com comentário. O retorno fica também no alerta de origem
(`alerta.retorno_tecnico`), como rótulo para o treino da parte B. Ciclo `aberta → em_andamento →
concluida`; concluir direto de `aberta` é aceito (quem conclui vira o responsável). Rotas
`/api/v1/ordens-servico` (listar, detalhe, `assumir`, `concluir`; ADMIN e TECNICO agem, OPERADOR só vê)
e evento SSE `os`.

Com z muito alto (como no simulador severo), a severidade passa de 600 z·s poucas janelas depois do alarme e a OS
abre por severidade antes dos 120 s de ALARME contínuo, sempre depois do alerta.

## Notificação no celular (push)

O app recebe notificação pelo serviço de push do Expo (passo a passo em [`app-push.md`](app-push.md)). Desligado
por padrão (`ps.push.habilitado`, variável `PUSH_HABILITADO`). Segue a ISA-18.2: só o que exige ação, nunca por
janela.

| Acontecimento | Quem recebe | Título (com `SIMULADO · ` antes, se o dado é simulado) |
|---|---|---|
| Alerta de máquina **entra em ALARME** (abre já em alarme ou piora de atenção para alarme) | todos os usuários ativos com aparelho | `ALARME · TORNO-01 · ponto B` |
| OS aberta | ADMIN e TECNICO | `OS ABERTA · TORNO-01 · ponto B` |
| Alerta de instrumento | ADMIN e TECNICO; o texto diz "problema no sensor, não na máquina" | `SENSOR · TORNO-01 · ponto B` |

Não geram push: ATENÇÃO, normalização, reconhecimento, supressão, alerta suprimido que volta a piorar e
tudo o que nasce durante ensaio de condição (quem está no torno provocou de propósito).

- **Um alarme, um push.** O mesmo alerta não avisa de novo, mesmo que fique em alarme por muitas janelas ou desça
  para atenção e volte (restrição única em `push_envio`).
- **Segundo push de propósito.** A OS aberta depois de um alarme gera outro push, para ADMIN e TECNICO: é o
  escalonamento para quem conserta, e não repetição.
- **Intervalo por ponto e tipo.** No máximo um push por ponto e tipo (alarme, OS, instrumento) a cada
  `ps.push.intervalo-min` (15 min; variável `PUSH_INTERVALO_MIN`). Protege contra um alarme que normaliza e reabre
  em ciclo. O alerta continua abrindo normalmente; só o push é segurado (contado no diagnóstico). Medição de
  23/11/2026, API local e simulador (`atencao` e `severo`, 288 janelas, cerca de 23 min): nenhum ponto reabriu
  em ciclo. Dado simulado: prova o encadeamento, não o comportamento no torno.
- **Conteúdo:** título curto, corpo com o componente provável e a primeira parte da explicação ("Ferramenta e
  porta-ferramenta: B·RMS 6,1σ acima do típico da marcha 1120. Toque para ver."), e dados para abrir o alarme ou
  a OS no app (`tipo`, `alerta_id` ou `os_id`, `maquina_id`, `simulado`). Canal Android `alarmes`, prioridade alta.
  Sem nome de pessoa nem e-mail.
- **Nunca atrasa a avaliação:** o envio acontece depois do commit, numa thread própria com fila de 200 (cheia,
  descarta e conta), tempo limite de 5 s por chamada e no máximo uma nova tentativa (rede, 429 ou 5xx). Falha vira
  log e contador. `DeviceNotRegistered` na resposta desativa o token. O cabeçalho de autorização só vai quando
  `EXPO_ACCESS_TOKEN` está configurado.
- **Rotas:** `PUT /api/v1/push/aparelhos` (registra o aparelho do próprio usuário; o mesmo token com outro
  usuário passa para ele), `POST /api/v1/push/aparelhos/remover` (ao sair; 204 sempre) e
  `GET /api/v1/push/diagnostico` (só ADMIN: enviados, falhos, tokens desativados, segurados pelo intervalo, sem
  destinatário, descartados, aparelhos ativos, desde a subida da API).
- **Limitação:** a API lê só a resposta imediata do Expo (o "ticket"). O `DeviceNotRegistered` que chega depois,
  no recibo, não é consultado: esse token só é desativado no envio seguinte, se o Expo responder o erro na hora.

Testes com um servidor falso no lugar do Expo (`PushIntegracaoTest`): alarme novo envia uma vez; a mesma
ocorrência não reenvia; ATENÇÃO, normalização e reconhecimento não enviam; reabertura dentro do intervalo é
segurada e volta a avisar depois dele; OS e instrumento vão só para ADMIN e TECNICO; `DeviceNotRegistered`
desativa; serviço fora do ar não muda a avaliação. Nenhum teste chama o serviço real.

## Perfil de tempos curtos (só para teste)

`application-tempos-curtos.yml` encurta atraso, saída, instrumento e OS para o Playwright do fluxo de
alarme. No compose local: `$env:PERFIL_API = "tempos-curtos"; docker compose up -d api`. Nunca em
produção. Os testes da API não precisam dele: eles controlam o `medido_em` das janelas.

## Roteiro de demonstração com o simulador

Prova o **encadeamento** (gravar → referência → avaliação → alerta → OS → retorno) com dado SIMULADO; não
prova detecção real. Use a MESMA rotação em tudo (1120 rpm): o nível de vibração cresce com a rotação e uma
referência gravada numa rotação acusaria desvio em outra. Contra o compose local, com os tempos normais
(sem o perfil de teste), a partir de um banco vazio (`docker compose down -v; docker compose up -d --build`):

```powershell
# 1. ensaios normais de T0, T1 e T3 a 1120 rpm, 30 janelas cada, com material e ferramenta (receita do T3)
python analise/simulador.py roteiro --etapas T0,T1,T3 --condicoes normal --rotacoes 1120 --janelas 30 --material "aço 1045" --ferramenta "bit de metal duro"
# 2. recalcular a referência (painel: Coleta → Referência → Recalcular referência; ou a rota)
POST /api/v1/maquinas/1/referencias/recalcular?simulado=true
# 3. uso normal por 5 min: tudo NORMAL, nenhum alerta
python analise/simulador.py continuo --rotacao 1120
# 4. severo: atenção e alarme, depois OS
python analise/simulador.py continuo --modo severo --rotacao 1120
# 5. voltar ao normal (de novo o comando do passo 3): normaliza; reconhecer encerra
```

`--ferramenta` procura a ferramenta pelo nome no catálogo (cria se não existir) e manda o id em cada
ensaio; com `--material`, o T3 ganha a célula da receita (material + ferramenta) além da T3 genérica.

**O que foi visto (execução de 18/11/2026, máquina local, relógio medido pelo script):**

| Passo | Resultado |
|---|---|
| 1 e 2 | 90 janelas gravadas em 10 s; referência versão 1 com 90 janelas usadas, 75 de 75 células com janelas suficientes |
| 3 | 5 min (316 s de observação a cada 10 s): máquina e os 3 pontos NORMAL em todas as leituras, 0 alertas. Nenhuma correção foi necessária |
| 4 | alarme não reconhecido em A, B e C aos 16 s do início do severo (15 s de atraso + a janela de 5 s). Primeira execução (regra antiga): a OS abriu aos 5 s, antes do alarme. **Repetido depois da correção** (banco limpo, tempos normais, roteiro com `--ferramenta`; o passo 3 durou 60 s, 0 alertas): alarme aos 16 s; OS-2026-0001 por severidade (648 z·s, ponto A) com origem no alerta 1 (A, máquina, alarme), aberta 0,23 s depois de o alerta ser criado (sondagem do script a cada 5 s: vista aos 17 s) |
| 5 | máquina NORMAL 15 s depois da volta ao normal (histerese de 15 s); os 3 alertas ficaram "normalizado, não reconhecido"; reconhecer os encerrou (resposta `encerrado`) |

**Sobre a OS no passo 4.** O prompt esperava a OS "depois de 2 min". O limite de severidade (600 z·s) foi
pensado para z ≈ 5 (cerca de 5 min); o modo severo do simulador produz z da ordem de dezenas no 1X e 3X,
então 600 z·s passa em segundos. Os limites não foram mexidos para esconder isso: o caso do alarme contínuo
de 120 s é coberto no teste de integração `alarmeContinuoAbreOsEOTecnicoConcluiRejeitada` (z ≈ 5,5, com o
relógio das janelas controlado). Com dado real, a severidade só se acumula depressa se o desvio for enorme.
## Limitações

- Nenhum número desta página foi confirmado com o torno: são todos proposta. Os testes provam a lógica
  com sinal sintético; o roteiro de demonstração prova o encadeamento com dado simulado.
- A validação do alerta de instrumento depende dos ensaios reais com rótulo `sensor_solto`.
- **Escolha da referência fora de ensaio.** Sem ensaio aberto, a API não sabe se o torno está girando em
  vazio ou cortando: compara a janela com o T1 (vazio) e com a T3 genérica (corte) e fica com o menor
  pior z. Isso evita alarmar todo corte, mas tem dois efeitos:
  - o giro em vazio também é comparado com o corte. Um defeito que **sobe o nível do vazio sem passar
    do nível normal de corte** (por exemplo, um desbalanceamento leve que leva o vazio de 0,10 g para
    0,13 g quando o corte normal é 0,14 g) sai como NORMAL fora de ensaio, porque contra o corte o z é
    baixo. **Dentro de um ensaio T1** a comparação é só com o T1 e o mesmo defeito é detectado;
  - pelo mesmo motivo, um valor entre o vazio e o corte normal (corte leve) passa como normal.

  Os números do exemplo são ilustrativos (do sinal sintético dos testes), não medidos. Quanto essa
  limitação pesa no uso real só se sabe com os ensaios T0 a T3 no torno (com as condições de defeito
  gravadas nas duas etapas); é essa coleta que valida ou derruba a regra. Até lá, para conferir a
  máquina em vazio, abra um ensaio T1.
- O firmware de 17/11/2026 manda saturação e amostras só da janela inteira; até ele mandar os campos por
  ponto, o alerta de instrumento por saturação ou falta de amostras fica com o ponto de maior pico, que pode
  não ser o sensor com defeito (o motivo do alerta avisa).
- A deriva compara a mediana das razões RMS ÷ típico (porque a marcha muda o nível), não as medianas
  brutas.
