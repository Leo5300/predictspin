# Roteiro de teste do app no celular (partes A e B)

Para conferir no aparelho o que os testes automáticos não alcançam. Faça uma vez no iPhone e uma vez no
Android. Anote o resultado (ok / falhou + o que viu) nas colunas da direita. Como rodar está em
[`app.md`](app.md#como-rodar).

**Antes:** `docker compose up -d` no notebook; `mobile/.env` com `EXPO_PUBLIC_API_URL`; `npx expo start` em
`mobile/`; app aberto pelo Expo Go. Para dado e alarme, deixe o simulador rodando em outro terminal:
`python analise/simulador.py continuo --modo severo` (precisa de referência calculada; ver
[`alarmes.md`](alarmes.md#roteiro-de-demonstração-com-o-simulador)).

Aparelhos usados: iPhone ______ (iOS ____) · Android ______ (versão ____) · Data ____/____

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| 1 | Abra o app sem `EXPO_PUBLIC_API_URL` no `.env` | Tela de entrada avisa "Endereço da API não configurado" e não mostra o formulário | Confira se o `.env` está mesmo vazio e reinicie o `npx expo start` | | |
| 2 | Com o endereço certo, entre com senha errada | "E-mail ou senha errados." em caixa tracejada, sem vermelho | Anote a mensagem que apareceu | | |
| 3 | Erre a senha até a API bloquear | "Muitas tentativas. Tente de novo em X." com o tempo do bloqueio | Anote o texto; confira se a API mandou `Retry-After` | | |
| 4 | Toque em "Mostrar" na senha | A senha aparece; o botão vira "Ocultar" | — | | |
| 5 | Entre com a senha certa | Se o aparelho tem digital/rosto: pergunta "Usar … para entrar?" uma vez. Depois abre Máquina | Anote se a pergunta não veio | | |
| 6 | Feche o app de vez e abra de novo (biometria ligada) | Pede digital/rosto; ao passar, entra sem senha. No Expo Go do iPhone com Face ID, cai na senha do aparelho (limitação conhecida) | Anote o que o sistema pediu | | |
| 7 | Conta → biometria "Desligada"; feche e abra o app | Entra direto, sem pedir biometria nem senha | — | | |
| 8 | Token vencido: na API, encurte a validade (`JWT_EXPIRATION_MS=60000` no `.env` da raiz e `docker compose up -d api`), entre e espere 1 min; depois tire a linha e suba a API de novo | Volta à entrada com "Sua sessão expirou. Entre novamente." | Anote em que tela ficou | | |
| 9 | Fonte = Simulado (Conta). Abra Máquina | Faixa hachurada "dado simulado" no topo; selo SIM em cada ponto; placa OPERANDO em matriz de pontos; rotação em matriz; barra do topo "ao vivo" e "última janela há X s" contando | Anote se a barra ficou em "reconectando" (o SSE não leu em fluxo) | | |
| 10 | Olhe os pontos A, B e C | Letra, amostra contínua/tracejada/pontilhada, RMS grande, selo de estado (texto + forma + cor), régua, sparkline; nenhum ponto colorido sem estar em desvio | — | | |
| 11 | Toque num ponto | Detalhe com RMS, PICO, CURT, 1X, 2X, 3X e VEL; típico e z quando houver referência | — | | |
| 12 | Puxe a tela da máquina para baixo | Atualiza (indicador do sistema) | — | | |
| 13 | Pare o simulador (Ctrl+C) e espere 20 s | Valores em cinza claro, "sem dados há X", placa SEM DADOS tracejada, rotação em Plex Mono cinza; nada parece vivo | — | | |
| 14 | Ligue o simulador de novo com o app aberto em Alarmes | Alarme novo entra na lista; aviso curto no topo e vibração de aviso, sem som | Anote se veio o aviso e se vibrou | | |
| 15 | Abra um alarme ativo não reconhecido | Ícone pisca devagar; ação recomendada em destaque; linha do tempo; segunda opinião só se houver modelo ativo, com "Segunda opinião, não muda o alarme" | — | | |
| 16 | Segure "Segure para reconhecer" e solte no meio | Anel de tiques enche e volta; nada é reconhecido; vibra durante | — | | |
| 17 | Segure até completar | Vibra de sucesso; estado vira "ativo, reconhecido" (resposta da API); o ícone para de piscar | Anote o estado mostrado | | |
| 18 | Como ADMIN, "Suprimir…": motivo, prazo, segurar | Prazos vêm da API (15 min, 1 h, 4 h, 1 dia); estado vira "suprimido" com o prazo; "Cancelar supressão" desfaz | Como OPERADOR, o botão não aparece | | |
| 19 | Ative "Reduzir movimento" no sistema e abra um alarme não reconhecido | O ícone não pisca; um anel parado fica em volta | — | | |
| 20 | Modo avião com o app aberto | Faixa "Sem conexão com a API. Os dados na tela estão velhos."; reconhecer e suprimir desligados; nada fica guardado para depois | — | | |
| 21 | Desligue o modo avião | A faixa some sozinha e os dados voltam | — | | |
| 22 | Mande o app para segundo plano por 1 min e volte | Reconecta e recarrega; a barra volta a "ao vivo" | — | | |
| 23 | Use a API do Render dormindo (fora do horário de uso) e entre | "Acordando o servidor, aguarde…" e nova tentativa sozinha; entra quando ela responde | Anote quanto tempo levou | | |
| 24 | Conta → Tema "Escuro", depois "Claro", depois "Sistema" | Troca na hora; grafite sem preto puro; claro cinza sem branco puro; barra de status legível | — | | |
| 25 | Fonte do sistema no maior tamanho (até 130% vale; acima o app limita) | Nada sobrepõe nem corta valor; textos quebram linha | Print da tela que quebrou | | |
| 26 | Leitor de tela (VoiceOver/TalkBack) na Máquina e num alarme | Cada controle tem nome; estado do ponto e do alarme ditos em texto; segurar funciona com "tocar duas vezes e segurar" | Anote o controle sem nome | | |
| 27 | Conta → Galeria de estados (só em desenvolvimento) | Todos os estados nos dois temas (botão de tema no topo), inclusive os da parte B: OS em cada estado, coleta pronta/com avisos/bloqueada/gravando com saturadas, tendência com buraco, modelo sem métricas, notificações em cada estado; conferir em 3 minutos | Print do estado que quebrou | | |
| 28 | Conta → Sair; abra o app | Volta à entrada com o e-mail preenchido e sem sessão | — | | |

## Tendência do ponto (parte B)

Simulador em modo severo, fonte Simulado. Funciona no Expo Go.

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| G1 | Máquina → toque num ponto; role até "Tendência do RMS" | Linha contínua cinza; faixa normal sombreada; linhas finas de atenção e alarme; legenda com a marcha e a etapa da referência | Anote se a faixa não apareceu e o texto no lugar dela | | |
| G2 | Troque 15 min, 1 h, 8 h e 24 h | Cada período carrega; 8 h e 24 h mais suaves (média do intervalo) | Anote o período que demorou ou falhou | | |
| G3 | Arraste o dedo na horizontal sobre o gráfico | Cursor com valor em g e hora; arrastar na vertical rola a tela | Anote se a tela rolou junto | | |
| G4 | Pare o simulador por 1 min e ligue de novo; volte ao período de 15 min | Buraco na linha no tempo parado, sem traço ligando as pontas | Print | | |
| G5 | Deixe o ponto entrar em atenção e em alarme | Marcas ▲ âmbar e ◆ vermelhas só nos instantes em desvio; o resto da linha fica cinza | — | | |
| G6 | Leitor de tela no gráfico; deslize para cima e para baixo | Diz o resumo (faixa, último valor, instantes em desvio) e anda pelas amostras | Anote o que disse | | |

## Ordens de serviço (parte B)

Precisa de OS simulada aberta: simulador em modo severo por uns 3 min (a OS abre com 120 s seguidos em ALARME).

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| O1 | Aba OS | Abertas sem dono no topo (borda grossa à esquerda e "ninguém assumiu" em destaque, sem cor), depois as com dono, em andamento e concluídas; cada linha com máquina, ponto, componente, há quanto tempo, quem assumiu e SIM | Anote a ordem que viu | | |
| O2 | Troque o filtro de status | A lista muda (a API filtra); lista vazia diz quando a API abre uma OS | — | | |
| O3 | Abra uma OS | Alarme de origem com valores; tendência do ponto 15 min antes e depois da abertura; componente provável; segunda opinião (abertura e mais recente) com "Segunda opinião, não muda a OS." quando houver modelo ativo | — | | |
| O4 | Como OPERADOR, abra a mesma OS | Sem "Assumir" nem "Concluir…", com o porquê | — | | |
| O5 | Como TECNICO, "Assumir" | Pede confirmação; confirmando, vira "em andamento" com você como responsável | Anote a mensagem | | |
| O6 | "Concluir…": sem escolher o retorno, tente segurar | O botão de segurar fica desligado e diz o que falta | — | | |
| O7 | Escolha o retorno, a condição e escreva uma observação; segure 1,5 s | Antes de segurar, a linha "Sua resposta ensina o modelo…"; depois, "concluída" com o retorno | Anote o estado | | |
| O8 | No detalhe do alarme de origem, toque na OS | Abre o detalhe da OS | — | | |

## Coleta (parte B)

ADMIN ou TECNICO. Simulador em modo normal (`--modo normal`), fonte Simulado. O ensaio gravado no simulado
fica marcado como simulado na API.

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| C1 | Com o simulador parado, abra a aba Coleta | Pré-voo com A, B, C, FC-51 e rotação em "✕ sem dado vivo"; o REC tracejado diz por que não grava | — | | |
| C2 | Ligue o simulador | As linhas reaparecem em sequência com ✓; o REC fica vermelho | Anote a linha que não ficou ✓ | | |
| C3 | Confira as escolhas | Começa pela próxima gravação sugerida; condição só no T3; T0 a 0 rpm; materiais e ferramentas do catálogo | — | | |
| C4 | Toque em REC | Vibração média; vira "GRAVANDO" com cronômetro em matriz de pontos, janelas contando e a fita ganhando um traço por janela | — | | |
| C5 | Abra o painel e tente abrir outro ensaio na mesma máquina | O painel mostra a recusa da API (um ensaio aberto por máquina) | — | | |
| C6 | "Marcar evento" → um motivo | Aviso "Evento marcado: …" | — | | |
| C7 | Bloqueie a tela do celular por 1 min e volte | A gravação seguiu: cronômetro e janelas pelo estado real da API | Anote se voltou zerado | | |
| C8 | "Segure para encerrar" até o fim | Vibração leve; volta a preparar; a célula da cobertura carimba "+1" | — | | |
| C9 | Grave outro e use "Segure para descartar" | Volta a preparar, sem carimbo | — | | |
| C10 | Com o modo severo (saturação depende da intensidade do simulador), olhe a fita | Janela saturada é um traço alto e hachurado; o contador mostra "· N saturadas" | Anote se nenhuma saturou (o simulador pode não saturar) | | |

## Modelos da IA (parte B)

Só ADMIN. Precisa de versão treinada no painel (Treinar fica só no painel).

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| M1 | Como TECNICO, abra Conta | Sem o atalho "Modelos da IA" | — | | |
| M2 | Como ADMIN, Conta → Modelos da IA | Ativa primeiro, depois candidatas e arquivadas; quem treinou e quem ativou | — | | |
| M3 | Abra uma versão | O aviso da validação (vaza pela referência; ativar só depois de medir memória no Render) acima das métricas; F1, recall por classe, matriz e regra × Isolation Forest; validação sem métricas diz o motivo | — | | |
| M4 | "Ativar…" numa candidata | Frase de consequência (a ativa vira arquivada; o modelo não muda estado nem prioridade de alarme); segurando 1,5 s, a versão vira ativa | Anote a mensagem da API | | |

## Push de alarme (parte B)

No Expo Go só dá para conferir a primeira linha. O resto pede o APK do perfil `preview` instalado no Android
(no iPhone não há push: ver [`app.md`](app.md#o-que-o-expo-go-não-tem)) e
`PUSH_HABILITADO=true` na API do Render, seguindo [`app-push.md`](app-push.md). O simulador fica apontado para
a API do Render, em modo severo.

| # | Faça | Esperado | Se não acontecer | iPhone | Android |
|---|---|---|---|---|---|
| P1 | No Expo Go dos dois celulares, entre e abra Conta | Nenhum pedido de notificação; em Conta, "Notificações indisponíveis neste modo." com o porquê | Anote o texto | | |
| P2 | No APK, entre pela primeira vez | Quadro no topo "Avisar neste celular quando houver alarme?" com o que chega; nenhuma janela do sistema ainda | Anote se a janela do sistema veio antes do quadro | — | |
| P3 | Toque em "Permitir" e aceite na janela do sistema | O quadro some; Conta mostra "Ligadas." (ou o aviso de envio desligado na API) | Anote o texto da Conta | — | |
| P4 | Com o app em segundo plano, deixe um ponto entrar em alarme | Chega "SIMULADO · ALARME · TORNO-01 · ponto …", com som e vibração do canal "Alarmes" | Anote quanto tempo levou | — | |
| P5 | Toque na notificação | Abre o detalhe daquele alarme, com a fonte em Simulado | Anote a tela que abriu | — | |
| P6 | Deixe o mesmo alarme continuar por vários minutos | Nenhum push novo para o mesmo alarme | Anote quantos chegaram | — | |
| P7 | Com o app aberto em Máquina e a fonte em Simulado, provoque um alarme novo | Faixa da notificação no topo, sem som; o aviso do app também aparece | — | — | |
| P8 | Ligue a biometria, feche o app, provoque um alarme e toque na notificação | Pede a digital; depois de destravar, abre o alarme | Anote se abriu a Máquina em vez do alarme | — | |
| P9 | Como TECNICO, deixe abrir uma OS | Chega "SIMULADO · OS ABERTA · …"; o toque abre o detalhe da OS | — | — | |
| P10 | Conta → Sair; provoque outro alarme | Nada chega neste celular | Anote se chegou | — | |
| P11 | Desinstale, instale de novo, entre e toque em "Agora não" | O quadro some e não volta ao abrir de novo; Conta oferece "Ligar notificações" | — | — | |
| P12 | Configurações do Android → PredictSpin → desligue as notificações; volte ao app | Conta: "Desligadas nas configurações do celular." e "Abrir configurações" leva até lá | — | — | |
