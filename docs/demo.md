# Demonstração ao vivo (barra de demonstração)

Para a apresentação de 27/11/2026, com o painel publicado no Render e o hardware desligado. A barra fica no pé de
todas as telas do painel, **só para ADMIN** e **só quando a API está com a demonstração ligada**. Ela troca o nível
da vibração **simulada** entre NORMAL, ATENÇÃO e ALARME, e o painel reage como reagiria com o torno de verdade:
ingestão, z contra a referência, atraso e histerese, alerta, alarme e ordem de serviço.

> **O que isto prova e o que não prova.** Com dado simulado, a demonstração prova o **encadeamento** (a janela
> entra pela mesma ingestão do dispositivo, o ponto sai de NORMAL para ATENÇÃO e ALARME, o alerta aparece, a OS
> abre, o painel mostra tudo ao vivo). Ela **não prova detecção real**: os limites (z de atenção 3, z de alarme 5,
> atraso, histerese) e a referência só valem depois dos ensaios T0 a T3 no torno. Dado simulado nunca é medição, e a
> faixa "DADOS SIMULADOS" e o selo SIM continuam na tela o tempo todo.

## Como funciona

- O gerador está **dentro da API** (`api/src/main/java/br/senai/predictspin/demo/`). Com um nível ativo, a cada
  `PS_DEMO_JANELA_S` segundos ele monta uma janela a 1120 rpm do dispositivo simulado `ps-sim-01` e a entrega ao
  mesmo serviço de ingestão do `POST /api/v1/telemetria` (por chamada de serviço, sem HTTP e sem chave). Tudo sai com
  `simulado = true`, no formato do simulador (`analise/simulador.py`).
- Os valores **não são fixos**: cada medida sai da **referência ativa** do ponto na marcha de 1120 rpm,
  `mediana + z × σ efetivo`, com o z sorteado numa faixa por nível. As faixas vêm de `ps.alarme.z-atencao` e
  `ps.alarme.z-alarme`, nada escrito à mão (se esses limites mudarem, os níveis acompanham).
- **Sem referência ativa** (T1 e T3 do ponto A, B e C a 1120 rpm), o gerador **não inventa nada**: o nível volta a
  PARADA e a barra mostra, em texto, o que falta.
- As janelas da demonstração não têm ensaio e ficam marcadas (`janela.demonstracao`). Elas **não entram** na
  deriva da referência (não influenciam "Recalcular referência"), no conjunto de treino (retorno da OS) nem nos
  indicadores de deriva do Diagnóstico.
- O estado vive em memória: reiniciar a API volta a PARADA. ATENÇÃO e ALARME voltam sozinhos a NORMAL depois de 5 min
  (`PS_DEMO_VOLTA_NORMAL_S`); o gerador para sozinho depois de 20 min sem nenhum clique (`PS_DEMO_PARAR_MIN`).
  Se chegar janela de um dispositivo **real** nos últimos 60 s, o gerador pausa e a barra avisa
  "Hardware real enviando".
- Rotas (todas em `/api/v1`, JSON em snake_case): `GET /demo/estado` e `POST /demo/cenario` com
  `{"nivel": "PARADA" | "NORMAL" | "ATENCAO" | "ALARME"}`. Só ADMIN (outro papel recebe 403); com a demonstração
  desligada respondem 404.

## Rodar localmente (compose)

Tudo local, nunca contra a produção. No PowerShell, na raiz do repositório:

```powershell
$env:PS_DEMO_HABILITADO = "true"; $env:PS_DEMO_JANELA_S = "2"; $env:PERFIL_API = "tempos-curtos"
docker compose up -d --build api
```

Depois, o painel local (`npm run dev` em `painel/`), login como ADMIN. A referência simulada de 1120 rpm sai do simulador:
`python analise/simulador.py roteiro --etapas T0,T1,T3 --condicoes normal --rotacoes 1120 --janelas 30` e, no painel,
Coleta › Referência › Recalcular referência (Simulado). O Playwright da barra (`painel/e2e/demonstracao.spec.ts`) faz isso
sozinho e confere o fluxo atenção, alarme, normal, reconhecer e encerrar.

## Roteiro de 3 minutos

Antes de começar: logado como ADMIN, fonte **Simulado**, na visão geral ou na tela da máquina, barra aberta. Teclas
da barra (valem em qualquer tela, menos num campo de texto): **1** Normal, **2** Atenção, **3** Alarme, **0** Parar.

Os tempos abaixo dependem do perfil de tempos curtos da seção seguinte (atraso de 10 s, saída de 10 s, janelas de
2 s). Com os padrões de produção (15 s, 15 s, janelas de 5 s), some uns 5 a 10 s a cada passo.

| Tempo | Ação | O que mostrar |
|---|---|---|
| 0:00 | Falar da barra: "dados simulados, torno desligado". Apertar **1** (NORMAL). | Os três pontos (A acionamento, B ferramenta, C estrutura) com RMS perto do típico, z em torno de zero, estado NORMAL. |
| 0:30 | Apertar **2** (ATENÇÃO). | Em cerca de 10 a 15 s o ponto **A** passa a ATENÇÃO (âmbar); B e C ficam normais ("A sobe mais que B e C"). Tela Alarmes: alerta de ATENÇÃO no A, com z, explicação e ação recomendada. |
| 1:10 | Apertar **3** (ALARME). | Em cerca de 10 s o **A** vai a ALARME (vermelho) e o **B** a ATENÇÃO; C continua normal. O estado da máquina é o pior entre os pontos. Alerta sobe de ATENÇÃO para ALARME. |
| 1:50 | Na tela Alarmes: **reconhecer segurando** o alerta do A. Mostrar a OS (abre depois de 20 s de ALARME contínuo) e assumir. | Ciclo de vida do alerta (ISA-18.2) e da OS. |
| 2:20 | Apertar **1** (NORMAL). | Em cerca de 10 s os pontos normalizam; o alerta passa a "normalizado, não reconhecido". Reconhecer segurando encerra. |
| 2:50 | Apertar **0** (Parar). Fechar com a frase da seção "O que isto prova". | Barra em PARADA. |

Se alguma coisa travar: **0** para a demonstração, e a barra diz o que está acontecendo (sem referência, hardware real
enviando, erro da API) em texto, sem inventar estado.

## Números de cada nível (medidos)

Medido em 27/11/2026, no ambiente **local** (docker compose, API com `PS_DEMO_JANELA_S=2` e perfil de tempos curtos),
com a **versão 7 da referência simulada** (marcha 1120 rpm; 332 a 411 janelas por célula). Cada nível rodou 70 s
(33 janelas de 2 s); a tabela traz o menor e o maior valor das 33 janelas, lidos do banco (`telemetria` e
`avaliacao`). O z é o z da API contra a referência usada na avaliação (T1 ou T3, a de menor pior z). **Dado
simulado: prova o encadeamento, não a detecção real.** Outro ambiente, com outra referência, dá outros números; os
**z** são os que se repetem.

Referência usada (típico ± σ efetivo, 1120 rpm):

| Ponto | Etapa | RMS (g) | Pico (g) | Curtose | 1X (g) |
|---|---|---|---|---|---|
| A acionamento | T1 em vazio | 0,0358 ± 0,0047 | 0,059 ± 0,017 | 1,65 ± 0,10 | 0,0455 ± 0,0041 |
| A acionamento | T3 corte | 0,0386 ± 0,0047 | 0,075 ± 0,017 | 1,86 ± 0,14 | 0,0460 ± 0,0034 |
| B ferramenta | T1 em vazio | 0,0183 ± 0,0048 | 0,033 ± 0,018 | 1,76 ± 0,14 | 0,0227 ± 0,0021 |
| B ferramenta | T3 corte | 0,0720 ± 0,0048 | 0,200 ± 0,020 | 2,43 ± 0,12 | 0,0562 ± 0,0035 |
| C estrutura | T1 em vazio | 0,0174 ± 0,0045 | 0,030 ± 0,017 | 1,72 ± 0,09 | 0,0218 ± 0,0021 |
| C estrutura | T3 corte | 0,0359 ± 0,0045 | 0,089 ± 0,017 | 2,26 ± 0,13 | 0,0333 ± 0,0022 |

Janelas geradas (menor a maior de 33 janelas por nível):

| Nível | Ponto | RMS (g) | Pico (g) | Curtose | 1X (g) | z do RMS | z do pico | z da 1X |
|---|---|---|---|---|---|---|---|---|
| NORMAL | A | 0,0349 a 0,0450 | 0,061 a 0,099 | 1,73 a 2,06 | 0,0429 a 0,0511 | −0,8 a 1,4 | −0,8 a 1,4 | −0,9 a 1,4 |
| NORMAL | B | 0,0674 a 0,0790 | 0,190 a 0,229 | 2,32 a 2,60 | 0,0539 a 0,0610 | −1,0 a 1,5 | −0,5 a 1,4 | −0,7 a 1,4 |
| NORMAL | C | 0,0314 a 0,0424 | 0,074 a 0,112 | 2,13 a 2,43 | 0,0312 a 0,0366 | −1,0 a 1,4 | −0,9 a 1,3 | −1,0 a 1,5 |
| ATENÇÃO | A | 0,0552 a 0,0594 | 0,127 a 0,144 | 2,09 a 2,17 | 0,0573 a 0,0608 | **3,6 a 4,5** | 3,2 a 4,2 | 3,3 a 4,3 |
| ATENÇÃO | B | 0,0777 a 0,0804 | 0,220 a 0,234 | 2,50 a 2,55 | 0,0602 a 0,0619 | 1,2 a 1,8 | 1,0 a 1,7 | 1,2 a 1,6 |
| ATENÇÃO | C | 0,0314 a 0,0426 | 0,073 a 0,115 | 2,15 a 2,44 | 0,0311 a 0,0365 | −1,0 a 1,5 | −0,9 a 1,5 | −1,0 a 1,4 |
| ALARME | A | 0,0667 a 0,0757 | 0,163 a 0,195 | 2,25 a 2,41 | 0,0656 a 0,0722 | **6,0 a 8,0** | 5,3 a 7,2 | 5,7 a 7,6 |
| ALARME | B | 0,0887 a 0,0910 | 0,261 a 0,276 | 2,63 a 2,69 | 0,0673 a 0,0699 | **3,5 a 4,0** | 3,0 a 3,7 | 3,2 a 3,9 |
| ALARME | C | 0,0314 a 0,0425 | 0,073 a 0,113 | 2,13 a 2,44 | 0,0312 a 0,0365 | −1,0 a 1,5 | −0,9 a 1,4 | −1,0 a 1,4 |

Faixas pedidas para o z do RMS e o que saiu: NORMAL −1 a +1,5 (saiu −1,0 a 1,5 nos três pontos); ATENÇÃO com A de 3,5 a
4,5 (3,6 a 4,5), B perto de 1,5 (1,2 a 1,8) e C normal; ALARME com A de 6 a 8 (6,0 a 8,0), B de 3,5 a 4 (3,5 a 4,0) e C
normal. Com z de atenção 3 e de alarme 5, o ATENÇÃO do A nunca passa de 5 (nunca vira ALARME por engano), e o NORMAL
nunca chega a 3.

Observação: a **curtose** não entra no estado do ponto (só RMS, pico, 1X, 2X, 3X e velocidade entram); no ponto A, em
algumas janelas NORMAL, o z da curtose contra o T1 chegou a 3,6 por causa da diferença entre o T1 e o T3 desse ponto, e isso
não gera atenção.

## Variáveis de ambiente para a Render

São **só para a demonstração**. Defina em **Environment** do serviço `predictspin-api` no painel do Render; o Render
reinicia o serviço ao salvar. Nenhuma está no `render.yaml`, para a publicação normal continuar com os padrões.

| Variável | Valor sugerido | Padrão atual | Para que serve |
|---|---|---|---|
| `PS_DEMO_HABILITADO` | `true` | `false` | Liga o gerador e as rotas `/api/v1/demo`. Desligada: rotas 404, nenhuma janela gerada, barra nem aparece. |
| `PS_DEMO_JANELA_S` | `2` | `5` | Intervalo entre as janelas geradas (s). Com 2 s o painel reage mais rápido. |
| `PS_ALARME_ATRASO_S` | `10` | `15` | Tempo seguido acima do limite para o ponto entrar em ATENÇÃO ou ALARME. |
| `PS_ALARME_SAIDA_S` | `10` | `15` | Tempo seguido abaixo do limite (menos a histerese) para o ponto sair. |
| `PS_OS_ALARME_CONTINUO_S` | `20` | `120` | Tempo de máquina em ALARME seguido para a OS abrir. |

Outras variáveis da demonstração, se quiser mudar (já têm bom padrão, não precisa definir): `PS_DEMO_VOLTA_NORMAL_S`
(`300`: ATENÇÃO e ALARME voltam sozinhos a NORMAL depois de 5 min) e `PS_DEMO_PARAR_MIN` (`20`: o gerador para sozinho
depois de 20 min sem clique).

- **Nomes conferidos.** Subi a API local com `PS_ALARME_ATRASO_S=7`, `PS_ALARME_SAIDA_S=8` e `PS_OS_ALARME_CONTINUO_S=21` (valores
  de teste) e `GET /api/v1/alarmes/limites` devolveu `atraso_s` 7, `saida_s` 8 e `alarme_continuo_s` 21, com `instrumento_s` ainda
  em 30: os nomes valem e só mudam o que dizem.
- **Equivale ao perfil de tempos curtos.** As três variáveis de tempo (`PS_ALARME_ATRASO_S`, `PS_ALARME_SAIDA_S`,
  `PS_OS_ALARME_CONTINUO_S`) dão os mesmos valores do perfil `tempos-curtos` (`SPRING_PROFILES_ACTIVE=tempos-curtos`),
  o que o Playwright local usa. O perfil também encurta o alerta de instrumento (10 s) e a conferência de supressões
  (5 s); com as variáveis acima eles ficam nos padrões (30 s e 30 s). Use um ou outro, não os dois.
- **Não foram mudados:** `ps.alarme.z-atencao` (3), `ps.alarme.z-alarme` (5), a histerese (1 σ) e a regra do
  alarme. Só os **tempos** ficam menores. A demonstração mostra o mesmo critério de produção, mais depressa.
- **Efeito colateral dos tempos curtos:** com janela de 2 s a severidade acumulada (z·s) cresce mais depressa que
  com 5 s (cada janela conta 5 s de duração), e a OS abre com 20 s de ALARME contínuo. Isso só vale enquanto as
  variáveis estiverem ligadas.
- **Como desligar depois:** apague `PS_DEMO_HABILITADO`, `PS_DEMO_JANELA_S`, `PS_ALARME_ATRASO_S`,
  `PS_ALARME_SAIDA_S` e `PS_OS_ALARME_CONTINUO_S` (ou volte `PS_DEMO_HABILITADO` para `false` e apague as outras), salve
  e deixe o Render reiniciar. Conferir: o painel não mostra mais a barra; `GET /api/v1/demo/estado` (como ADMIN) dá 404;
  `GET /api/v1/alarmes/limites` volta a mostrar 15 s, 15 s e 120 s.
- A migração `V11__janela_demonstracao.sql` (coluna `janela.demonstracao`, falsa por padrão, só acrescenta) roda sozinha
  no primeiro deploy deste código, com a demonstração ligada ou não.

## Checklist de preparação

Do dia anterior até 5 minutos antes. Tudo isto é feito **à mão por você**; nada disto é rodado contra a produção por
scripts do repositório.

1. **Publicar este código.** `git push` dos commits da barra, esperar o deploy do Render terminar (a migração V11 roda
   nele) e conferir `https://SEU-SERVICO.onrender.com/actuator/health` → `{"status":"UP"}`.
2. **Variáveis.** Definir as cinco variáveis da seção anterior e deixar o Render reiniciar. Entrar no painel como ADMIN:
   a **barra "DEMONSTRAÇÃO · dados simulados"** tem de aparecer no pé da tela.
3. **Acordar o serviço grátis.** O Render grátis dorme depois de 15 min sem uso e leva cerca de um minuto para acordar
   (o painel mostra "API acordando"). Abrir o painel e a URL de saúde uns 5 a 10 min antes e **deixar uma aba aberta**: o
   painel consulta a API a cada poucos segundos e isso mantém o serviço acordado.
4. **Referência ativa para 1120 rpm na produção.** Com a barra visível, aperte **1** (NORMAL): se faltar a referência
   simulada de 1120 rpm (T1 e T3 nos pontos A, B e C), a barra **diz em texto** "Sem referência ativa para a marcha da
   demonstração" e não gera nada. Conferir também em Coleta › Referência (cobertura por marcha e etapa, tipo de dado
   **Simulado**). Se faltar, gravar os ensaios simulados e recalcular a referência (isto **envia dado simulado à
   produção, por sua conta**):
   `python analise/simulador.py roteiro --url https://SEU-SERVICO.onrender.com --etapas T0,T1,T3 --condicoes normal --rotacoes 1120 --janelas 30`
   (a chave do dispositivo simulado vem do seu ambiente, não do comando) e, no painel, **Coleta › Referência ›
   Recalcular referência** com o tipo de dado Simulado. Cada célula precisa de pelo menos 24 janelas.
5. **Ensaiar 1 minuto.** Fonte Simulado; **1**, **2**, **3** (esperar o A chegar a ATENÇÃO e a ALARME), **1** de novo.
6. **Fechar o que o ensaio deixou.** Apertar **0** (Parar). Em Alarmes: **reconhecer segurando** cada alerta
   "normalizado" (reconhecer encerra); se a OS abriu, **assumir** e **concluir** com retorno "rejeitada: falso positivo"
   e o comentário "ensaio da demonstração". Conferir que não há alerta ativo nem OS aberta antes de começar a valer.
7. **Na hora:** painel aberto como ADMIN, fonte Simulado, barra aberta, zoom do navegador em 100% e a tela da máquina
   ou a de Alarmes na frente. Ter o telefone com o roteiro desta página.
8. **Uma aba só, sem recarregar.** A API aceita 4 conexões ao vivo por usuário (`EVENTOS_MAX_POR_USUARIO`) e só percebe que
   uma aba fechou depois de até 15 s. Várias abas do mesmo ADMIN, ou recarregar a página várias vezes seguidas, podem deixar a
   tela em "consulta a cada 5 s" e a lista de Alarmes sem atualizar sozinha (foi o que derrubou os primeiros testes
   automáticos). Navegue pelos links do painel em vez de recarregar, e feche as outras abas do painel.

O que o ensaio e a apresentação deixam no banco é histórico de dado **simulado** (marcado SIM), separado do dado real, e
não entra em referência nem em treino.

## Limites da demonstração

- É **dado simulado** de um sinal sintético: prova a lógica e o encadeamento, **não a detecção em torno de verdade**.
- Os números do alarme (z de 3 e de 5, atraso, histerese, OS) são **proposta** (`docs/alarmes.md`) até os ensaios T0, T1,
  T2 e T3 no torno da oficina; a referência só vale depois deles.
- Nada disto foi testado em hardware: não há ESP32 nem sensores no ambiente de desenvolvimento.
- A demonstração publicada no Render depende do serviço gratuito (0,1 CPU, 512 MB). Com janela de 2 s o gerador envia
  30 janelas por minuto; se o painel ficar lento, volte `PS_DEMO_JANELA_S` para `5`.
- Se o hardware real estiver ligado e enviando, a demonstração **pausa** sozinha para nunca disputar o painel com o
  torno de verdade.
