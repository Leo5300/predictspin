# IA parte B: modelos de segunda opinião, treino, tendência e fusão

A parte A (docs/[alarmes.md](alarmes.md)) é a regra: referência aprendida, z por medida, estado com atraso e
histerese, alertas ISA-18.2 e OS. A parte B acrescenta **dois modelos treinados em Python e executados dentro da
API Java como segunda opinião**: um Isolation Forest (anomalia, treinado só com o normal) e um Random Forest (as 5
classes). Também deixa prontas, e **desabilitadas por configuração**, a fusão com os canais lentos e a tendência por
ponto.

> **O alarme não depende de modelo.** Quem abre, piora, normaliza e encerra alerta e OS continua sendo a regra de z.
> O modelo só acrescenta escore de anomalia, classe provável, confiança e explicação. Modelo ausente, candidato,
> incompatível ou com erro nunca impede gravar a janela nem avaliar pela regra.
>
> **Dado simulado prova o encadeamento, não a detecção.** Toda métrica de modelo treinado com dado simulado aparece
> marcada "dado simulado: não é resultado". Modelos, limites e métricas só valem depois dos ensaios rotulados no
> torno (T0 a T3, com as condições gravadas).
>
> Linguagem: "classe provável", "segunda opinião", "estimativa". Nunca "diagnóstico", "previsão da falha" nem data de
> quebra.

## Visão geral

```
ingestão ─► fila da máquina ─► avaliação pela regra (commit) ─► segunda opinião (modelo ativo) ─► fluxo ao vivo
                                     │                                   │
                                     ▼                                   ▼
                          estado, alerta, OS               inferencia (por janela), opinião no alerta e na OS

ensaios rotulados + retorno da OS ─► conjunto (vetor calculado na API) ─► treino (Python) ─► versão CANDIDATA
                                                                                              │ (só ADMIN)
                                                                                              ▼
                                                                                           ATIVA
```

A segunda opinião roda **depois do commit da avaliação**, na mesma fila da máquina (`FilaDeAvaliacao`): nada do que
acontece nela volta para a regra. Python só **treina** (e pode dormir); a inferência roda na API, sem rede no caminho.

## Vetor de características (v1)

Calculado num lugar só, em Java (`VetorCaracteristicas`): a exportação do conjunto e a inferência chamam a mesma
função; o Python recebe a matriz pronta. Por janela de máquina (A, B e C juntos), nesta ordem:

| Colunas | Conteúdo |
|---|---|
| `z_<ponto>_<medida>` (21) | z de rms_g, pico_g, curtose, o1x, o2x, o3x e vel_rms_mm_s de A, B e C contra a referência em uso, cortado em ±50; a velocidade fica ausente quando a janela não a trouxe |
| `log_rms_b_a`, `log_rms_c_a` | razões de RMS em log natural |
| `marcha_rpm`, `etapa_t3` | marcha nominal e etapa (1 = corte, quando a maioria dos pontos foi comparada com o T3) |
| `canal_<código>` | só dos canais **habilitados** na fusão (valor bruto; árvores não dependem de escala) |

"Referência em uso" é a da **etapa**, sem a célula da receita: dentro de ensaio, a da etapa (T2 usa T1; T3 usa a
genérica da marcha); fora de ensaio, a mesma escolha da regra (T1 ou T3 genérica, a de menor pior z). Assim o treino
(gravado em ensaios) e a inferência (uso em aula) comparam com a mesma coisa. Os valores saem arredondados para
float, o tipo que as árvores comparam.

Não geram vetor (motivo contado no conjunto): modo rápido, janela reprovada no filtro de qualidade (saturou,
amostras faltando, fora da marcha, ordens zeradas), torno parado, calibração diferente da referência e falta de
referência completa nos três pontos.

## Rótulos e origens

| Origem | Janelas | Rótulo |
|---|---|---|
| `ensaio` | ensaios encerrados e não descartados, etapas T1 e T3, condição entre as 5 classes | a condição do ensaio |
| `os_confirmada` | OS concluída como confirmada com `condicao_encontrada` entre as 5: janelas de uso (sem ensaio) do período do alerta de origem | a condição encontrada |
| `os_rejeitada` | OS concluída como rejeitada (falso positivo): as janelas do período | normal |

- Classes: normal, avanco_excessivo, rotacao_inadequada, ferramenta_desgastada, desbalanceamento. `sensor_solto` não
  é classe (é validação do alerta de instrumento). "outra" ou sem condição: a OS não rotula nada.
- Período do alerta: da janela de origem até a primeira janela em que o ponto voltou a NORMAL (pelo `medido_em` das
  janelas); se não voltou, até a conclusão da OS.
- Janela no período de duas OS (alertas de A, B e C no mesmo episódio): vale a confirmada, depois a de menor id. A
  janela de ensaio sempre vale pelo ensaio.
- A janela com evento marcado e a seguinte ficam fora (como no CSV).
- Ligado por `ps.treino.usar-retorno-os` (true). Nunca entra janela sem rótulo.

Rotas do serviço de treino (cabeçalho `X-Treino-Chave` = variável `TREINO_CHAVE`, cadeia de segurança própria,
sem usuário): `GET /api/v1/treino/servico/conjunto/resumo` (colunas, versões e os parâmetros do treino) e
`GET /api/v1/treino/servico/conjunto` (páginas de até `ps.treino.pagina-max` linhas, com `janela_id`, `dia` local,
`rotulo`, `origem`, `ensaio_id`, `grupo`, valores e o motivo de quem não tem vetor).

## Treino (analise/treino)

Uma função (`executar`), dois jeitos de rodar, dependências fixadas em `analise/treino/requirements.txt`:

- **linha de comando**: `python -m analise.treino --api <URL> --trabalho <id>` (ou `--maquina-id 1 --simulado
  --saida pasta/` para só treinar);
- **serviço HTTP** (FastAPI) em Docker, perfil `treino` do compose: `GET /saude` e `POST /treinar`.

Os parâmetros vêm da API (`ps.modelo`, `ps.treino`), para não haver outra cópia deles:

| Parâmetro | Valor (proposta) | Uso |
|---|---|---|
| `ps.modelo.if-percentil` | 99 | limiar do IF = percentil do escore de anomalia nas janelas normais do treino |
| `ps.modelo.arvores-if` | 100 | árvores do Isolation Forest |
| `ps.modelo.arvores-rf`, `profundidade-max-rf` | 60, 10 | Random Forest pequeno (balanceado por classe) |
| `ps.modelo.semente` | 42 | treino reprodutível |
| `ps.modelo.confianca-min` | 0,6 | abaixo disto, "classe incerta" |
| `ps.modelo.tamanho-max-mb` | 5 | tamanho máximo de cada arquivo aceito |
| `ps.modelo.explicacao-top` | 3 | características citadas na explicação |
| `ps.treino.min-ensaios-por-classe` | 2 | classe com menos ensaios fica fora do classificador (e é listada) |
| `ps.treino.k-max` | 5 | partes da validação por ensaio |
| `ps.treino.espera-acordar-s` | 180 | quanto a API espera o serviço acordar |
| `ps.treino.prazo-execucao-min` | 30 | trabalho sem resultado no prazo vira "falhou" |

- **Isolation Forest**: só janelas normais. Escore de anomalia = `-score_samples` (maior = mais diferente do normal).
- **Random Forest**: as classes com pelo menos 2 ensaios; com menos de 2 classes, só o IF é treinado (e isso é dito).
- Colunas com algum valor ausente (por exemplo, a velocidade quando o firmware não mandou) saem do modelo e são
  listadas.

### Validação e métricas

- **Por ensaio**: GroupKFold pelo grupo (ensaio ou OS), k = menor entre `k-max` e os ensaios da classe mais rara,
  no mínimo 2. Nunca por linha (pedaços da mesma gravação dariam nota alta demais).
- **Por dia**: um dia de fora de cada vez, só com 2 dias ou mais; senão "não aplicável (1 dia)".
- Métricas: matriz de confusão, recall por classe, F1 macro; do IF, falso positivo nas janelas normais e detecção nas
  não normais de validação.
- **Regra × modelo**, nas mesmas janelas de validação: quanto o nível bruto da regra (z de alguma medida do estado
  ≥ z de atenção, **sem** atraso nem histerese, porque a validação embaralha janelas de ensaios diferentes) e o IF
  acusam desvio no normal e no não normal.
- Importância por permutação (queda do F1 macro; sem classificador, mudança do escore), top 10.

### Exportação

ONNX dos dois modelos (skl2onnx, entrada float32; o conversor do IF não aceita double), as árvores em JSON e os
metadados (características e ordem, versão do vetor e da referência, limiar, classes, métricas, conjunto por classe
e por origem, importância). Paridade em pytest: onnxruntime × scikit-learn em 500 janelas sintéticas, diferença
máxima medida de 2,3e-7 no escore e 4e-8 nas probabilidades (tolerância 1e-5).

## Botão Treinar

`POST /api/v1/maquinas/{id}/modelos/treinar?simulado=` (ADMIN e TECNICO) cria o trabalho (um em andamento por
máquina e tipo de dado; 409 se já houver).

| Estado | Quando |
|---|---|
| `pendente` | sem `ps.treino.url`: o trabalho traz o comando `python -m analise.treino --api … --trabalho N` para rodar no notebook com `TREINO_CHAVE` |
| `acordando` | com URL: a API chama `GET /saude` do serviço a cada 5 s, até `espera-acordar-s` (o plano gratuito dorme) |
| `executando` | o serviço aceitou (`POST /treinar`) ou avisou o início |
| `concluido` | o serviço entregou o resultado (multipart) e nasceu a versão **candidata** |
| `falhou` | serviço não acordou, recusou, avisou a falha, resultado inválido ou passou do prazo |

Cada mudança vira o evento SSE `treino`; versão nova ou ativada, o evento `modelo`. O resultado é conferido antes de
gravar: versão do vetor, tipo de dado, referência conhecida, tamanho dos arquivos, classes × classificador e as
árvores carregadas e executadas uma vez.

## Ativação

Versão nova nasce **candidata**. Só ADMIN ativa (`POST /api/v1/modelos/{id}/ativar`): uma ativa por máquina e tipo de
dado; a anterior vira **arquivada**. A tela mostra a comparação com a ativa antes de confirmar. Se a referência foi
recalculada depois do treino, o modelo continua rodando e o Diagnóstico avisa "referência mudou: treine de novo";
se a versão do vetor, uma característica ou um canal exigido não bate, o modelo não roda e o Diagnóstico diz por quê.
Real e simulado nunca se misturam: o modelo ativo é por máquina **e** tipo de dado.

## Inferência e segunda opinião

Em cada janela de máquina com vetor completo e modelo ativo do mesmo tipo: escore do IF, anomalia (escore acima do
limiar), classe mais provável do RF e confiança (a maior probabilidade). Confiança abaixo de `confianca-min` aparece
como "classe incerta". Explicação: as 3 características de maior importância × |z| naquela janela, em texto pronto:
"classe provável: avanço excessivo (78%) · B·RMS 4,1σ, B·pico 3,6σ · modelo v3". Grava uma linha compacta em
`inferencia` (modelo, escore, anomalia, classe, confiança) e a opinião (JSON) no alerta de máquina ativo e na OS
aberta: a da abertura (a primeira) e a mais recente. Concordância: "o modelo também vê anomalia" ou "o modelo não vê
anomalia". Erro na inferência vai para o log e para o contador do Diagnóstico; a janela e a regra não mudam.

## ONNX × Java (memória medida)

Critério definido antes de medir [PROPOSTA]: com o ONNX Runtime para Java, pico de memória do contêiner abaixo de
450 MB → fica o ONNX; acima → plano B (avaliar as árvores do `arvores.json` em Java puro, com paridade conferida).
Medido no compose local (Windows, Docker Desktop), API com limite de 512 MB e as opções de JVM da produção
(`-Xmx220m -XX:MaxMetaspaceSize=160m -Xss512k -XX:+UseSerialGC`, pool de 5 conexões), modelo de fixture ativo. Memória
lida dentro do contêiner a cada ~1 s: RSS do processo (`ps`), memória anônima e `memory.current` do cgroup. Unidades
em MiB, como o Docker e o kernel mostram (1 MiB = 1,048576 MB).

| Situação | Cache de código | RSS | Anônima | cgroup |
|---|---|---|---|---|
| ONNX, parado 60 s depois de subir (modelo ainda não carregado) | 48 MB | 366 MiB | 344 MiB | 363 MiB (docker stats) |
| ONNX, modelo carregado e 5 janelas avaliadas | 48 MB | 427 MiB | 383 MiB | 408 MiB (docker stats) |
| ONNX, estresse de 20 usuários por 60 s | 48 MB | máx. 454 MiB | máx. 409 MiB | pico 477 MiB |
| Java puro (árvores), parado 60 s depois de subir | 48 MB | 369 MiB | 347 MiB | 367 MiB (docker stats) |
| **ONNX, cenário realista por 5 min** (1 dispositivo a cada 5 s + 4 usuários consultando a cada 5 s) | 96 MB | **máx. 431,3 MiB** | máx. 389,1 MiB | máx. 448,9 MiB (pico 449) |

**Decisão: ONNX Runtime.** O critério foi aplicado ao cenário realista (o uso real é 1 ESP32 e até 4 pessoas no
painel), em que o pico de RSS ficou em 431,3 MiB, abaixo de 450. Ressalvas: em MB decimais o mesmo pico é 452 MB, e o
estresse de 20 usuários passou de 450 MiB (RSS 454, cgroup 477); a folga é pequena. O plano B ficou pronto e testado só nos testes
(`MotorArvores`, paridade com as saídas do onnxruntime do Python em 500 janelas, tolerância 1e-5), fora do caminho do
alarme. A imagem com o ONNX Runtime tem um jar de 122 MB (as bibliotecas nativas de todas as plataformas vêm junto).

No mesmo cenário realista, com o modelo ativo: p95 da ingestão 1,50 s e das consultas 1,47 s (p99 5,38 s e 6,05 s),
0 erros em 282 requisições, 8 pausas completas do GC desde que a API subiu. O modelo rodou durante a carga: as 54
janelas gravadas no período têm a linha de `inferencia` (contado no banco depois, porque o contador do Diagnóstico
fica em memória e zerou quando a API foi recriada). Com a memória perto do limite do contêiner
(cgroup em 449 de 512 MiB) a resposta ficou lenta mesmo com carga leve; isso não foi investigado além desta medição
(decisão do projeto: sem mais rodadas de carga). Na execução de estresse com o cache de código de 48 MB, 17 pausas
completas "CodeCache GC Threshold" de até 4,9 s explicaram as paradas; por isso o `render.yaml` passou a reservar
96 MB.

## Tendência e fusão (prontas e desabilitadas)

**Fusão.** `ps.fusao.canais.<código>.habilitado` (false para os 6 canais: temperaturas do cabeçote, da ferramenta e
ambiente, umidade, corrente e o nível de som criado na V9). Habilitado e presente, o canal entra no vetor; o modelo
grava os canais que usou e não roda se algum deles for desabilitado depois.

**Tendência** (`ps.tendencia.habilitada=false`; `GET /api/v1/maquinas/{id}/tendencia`). Por ponto, séries diárias
dos últimos `janela-dias` (60): severidade acumulada (z·s por dia), deriva (mediana do z do RMS das janelas
avaliadas no dia) e, com o canal habilitado, a temperatura média do cabeçote. Inclinação de Theil-Sen com intervalo
de 95% (método de Sen) e, quando a série sobe, "se continuar assim, entre X e Y dias" até o limite
(`limite-severidade` 600 z·s/dia, `limite-deriva-z` 3, `limite-temp-cabecote-c` 60 °C), só com pelo menos
`min-dias` (7) dias. Quando o intervalo inclui "não subir", só o mínimo é dito. Desabilitada, a rota responde
`habilitada: false` com "desabilitada por configuração". Testes com séries sintéticas (subindo, estável, ruidosa,
curta demais) e com tudo ligado num perfil de teste.

## Roteiro de demonstração (executado em 22/11/2026)

> **DADO SIMULADO.** Prova o encadeamento (gravar → referência → treinar → ativar → segunda opinião no alerta e na
> OS → retorno do técnico como rótulo), **não** a detecção real. As assinaturas das classes no simulador foram
> escritas à mão; modelos, métricas e limites só valem depois dos ensaios rotulados no torno.

Contra o compose local, banco vazio (`docker compose --profile treino down -v; docker compose --profile treino up -d
--build`, com `TREINO_URL=http://treino:8090` e `TREINO_CHAVE` no `.env`), tempos normais, tudo a 1120 rpm:

```powershell
# 1. conjunto (acelerado): T0, T1 e T3 normais e as 4 condições no T3, 3 ensaios por classe, 30 janelas, 2 dias
python analise/simulador.py roteiro --etapas T0,T1,T3 --condicoes normal --rotacoes 1120 --janelas 30 --repeticoes 2 --material "aço 1045" --ferramenta "bit de metal duro" --inicio 2026-11-21T13:00:00Z
python analise/simulador.py roteiro --etapas T3 --condicoes avanco_excessivo,rotacao_inadequada,ferramenta_desgastada,desbalanceamento --rotacoes 1120 --janelas 30 --repeticoes 2 --material "aço 1045" --ferramenta "bit de metal duro" --inicio 2026-11-21T15:00:00Z
python analise/simulador.py roteiro --etapas T0,T1,T3 --condicoes normal --rotacoes 1120 --janelas 30 --material "aço 1045" --ferramenta "bit de metal duro"
python analise/simulador.py roteiro --etapas T3 --condicoes avanco_excessivo,rotacao_inadequada,ferramenta_desgastada,desbalanceamento --rotacoes 1120 --janelas 30 --material "aço 1045" --ferramenta "bit de metal duro"
# 2. referência: Coleta → Referência → Recalcular (ou POST /api/v1/maquinas/1/referencias/recalcular?simulado=true)
# 3. Modelos → Treinar (ou POST /api/v1/maquinas/1/modelos/treinar?simulado=true); 4. Ativar
# 5. uso normal por 5 min
python analise/simulador.py continuo --rotacao 1120
# 6. condição (depois de cada uma, volte ao normal e reconheça os alertas)
python analise/simulador.py continuo --rotacao 1120 --condicao avanco_excessivo
python analise/simulador.py continuo --rotacao 1120 --condicao desbalanceamento
# 7. OS → Concluir: confirmada, condição encontrada "avanço excessivo"; depois Treinar de novo
```

Os passos 2 a 4 e 7 foram feitos pelas mesmas rotas que os botões do painel chamam (script de medição); o fluxo pelos
botões da tela é o do teste `painel/e2e/ia.spec.ts`. Tempos medidos pelo script a partir do início de cada passo:

| Passo | O que foi visto |
|---|---|
| 1 | 630 janelas em 50 s (9 ensaios normais T0/T1/T3 e 12 de condição no T3, em 2 dias) |
| 2 | referência versão 1: 270 janelas usadas, 75 de 75 células suficientes |
| 3 | trabalho `acordando → executando → concluido` em 19,9 s pelo serviço do compose; conjunto de 540 janelas (normal 180 e 90 de cada condição; 6 ensaios normais e 3 de cada condição; 2 dias); nenhuma classe fora; limiar de anomalia 0,562 |
| 3 (métricas, simulado) | por ensaio (k = 3): F1 macro 0,872; recall normal 1,00, avanço excessivo 0,81, desbalanceamento 0,83, rotação inadequada 0,82, ferramenta desgastada 0,84. Por dia (2 dias): F1 macro 0,88. Regra × IF nas mesmas janelas: regra acusou 1,1% das normais e 100% das não normais; IF, 3,9% e 96,1% |
| 4 | versão 1 ativada (ADMIN); 1 305 535 bytes de arquivos |
| 5 | 5 min de uso normal: máquina NORMAL em todas as 31 leituras, 0 alertas; 62 janelas com segunda opinião, **100% "normal"** e 1 com anomalia |
| 6 avanço excessivo | alarme pela regra aos **15,6 s**; OS-2026-0001 aos **92,5 s**; segunda opinião nos alertas de B e C: avanço excessivo, confiança 100% na abertura e 97% na mais recente; explicação "classe provável: avanço excessivo (97%) · B·curtose 3,6σ · modelo v1" |
| 6 desbalanceamento | alarme pela regra aos **15,5 s** em A, B e C; segunda opinião: desbalanceamento, 100% |
| 7 | OS concluída como confirmada com "avanço excessivo"; o treino seguinte (12,1 s) contou **21 janelas com origem `os_confirmada`** (avanço excessivo foi de 90 para 111) |

**O que o roteiro mostrou além do encadeamento.** A explicação citou só uma característica (B·curtose) nas duas
condições, inclusive no desbalanceamento, em que se esperaria A·1X. A conta é a pedida (importância por permutação ×
|z|), mas a importância ficou concentrada em poucas características e as de peso zero não são citadas. Com dado real
isso precisa ser revisto. Com o sinal do simulador as classes se separam com folga, por isso as confianças ficaram
perto de 100%: o resultado não diz nada sobre a separação no torno.

## Banco

Antes da V9: 2 065 bytes por janela (janela, 3 telemetrias, 5 leituras e 3 avaliações, com índices; banco local de
12 923 janelas). A V9 acrescenta uma linha de `inferencia` por janela com modelo ativo: **52 bytes de linha
medidos** (média de `pg_column_size` em 112 linhas). Somando o ponteiro da linha e as duas entradas de índice
(estimadas, não medidas), dá cerca de 96 bytes a mais por janela, ou cerca de 1,7 MB por dia a uma janela a cada
5 s, 24 h (antes: 35,7 MB por dia). Cada versão de modelo ocupa cerca de 1,3 MB (os dois ONNX e as árvores).

## Limitações e o que só vale com dado real

- Nenhum número de modelo desta página foi obtido com dado do torno: os do roteiro são de dado SIMULADO e as
  assinaturas das classes no simulador foram escritas à mão (servem para testar o encadeamento).
- As janelas normais usadas na referência também entram no treino do IF; com a referência calculada sobre elas, o z
  dessas janelas é "dentro da amostra" e o limiar tende a ficar otimista.
- A comparação regra × modelo usa o nível bruto da regra, sem atraso nem histerese.
- Classes que no torno não mexem no giro em vazio (avanço, rotação, desgaste) terão janelas T1 rotuladas com a
  condição mas parecidas com o normal: grave as condições no T3.
- A tendência e a fusão não foram usadas com dado real; os limites da tendência são proposta.
