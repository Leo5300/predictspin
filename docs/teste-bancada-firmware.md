# Teste de bancada: ESP32 → API no Render

Roteiro para conferir o firmware de 3 sensores no laboratório do SENAI, com o dispositivo real
`ps-torno-01`. Primeiro só com o ponto A ligado (passos 1 a 10), depois com os três (passo 11).
Os passos 12 a 18 (segunda rodada, 17/11/2026) são as medições que viram número para o artigo:
calibração, piso de ruído, teste-reteste, fixação, batida, banda e FC-51 em todas as marchas. As
tabelas deles estão **vazias de propósito**: só entra número medido.
Cada passo diz o que deve acontecer e o que fazer se não acontecer. Anote os números que aparecerem:
são a primeira medição real do firmware.

**Importante:** as janelas enviadas aqui são **medições reais** e ficam gravadas como tal. Não deixe
ensaio real aberto na máquina durante o teste, senão as janelas de teste entram no ensaio. Confira
antes com `GET /api/v1/maquinas/{id}/ensaios` e encerre ou descarte o que estiver aberto.

## O que levar

- notebook com Python e PlatformIO (`python -m pip install platformio`) e o repositório atualizado;
- cabo micro-USB **de dados** (cabo só de carga não grava);
- `firmware/include/segredos.h` preenchido (ver passo 1);
- celular com hotspot (para os testes sem rede e de hibernação);
- e-mail e senha de um usuário da API (para as consultas e o modo rápido);
- uma chave de boca ou de fenda para as batidas.
- nível de bolha (calibração sobre superfície nivelada), caneta para marcar o contorno do ímã, fita
  dupla-face, e uma tira de fita branca ou papel refletivo de cerca de 1/8 da volta da flange (item 18).

As consultas abaixo usam PowerShell. Antes delas, entre uma vez na mesma janela:

```powershell
$API = "https://SEU-SERVICO.onrender.com"
$corpo = @{ email = "SEU_EMAIL"; senha = "SUA_SENHA" } | ConvertTo-Json
$token = (Invoke-RestMethod -Method Post "$API/api/v1/auth/login" -ContentType "application/json" -Body $corpo).token
$H = @{ Authorization = "Bearer $token" }
$maquina = (Invoke-RestMethod "$API/api/v1/maquinas" -Headers $H).conteudo | Where-Object codigo -eq "TORNO-01"
$maquina.id
```

O token vale 24 h.

## 1. Compilar e gravar

1. Em `firmware/`, copie `include\segredos.exemplo.h` para `include\segredos.h` e preencha:
   - as duas redes (escola e hotspot);
   - `API_URL` com o endereço do Render, sem barra no fim;
   - `DISPOSITIVO_ID` como `ps-torno-01`;
   - `DISPOSITIVO_CHAVE` com o mesmo valor de `DISPOSITIVO_TORNO_CHAVE` configurado no Render.

   O arquivo fica fora do Git.
2. Ligue o ESP32 no USB e rode:

   ```powershell
   cd firmware
   python -m platformio run -t upload
   python -m platformio device monitor
   ```

| Esperado | Se não acontecer |
|---|---|
| `SUCCESS` na compilação e na gravação | erro `Falta include/segredos.h`: faça o item 1. Porta não encontrada: troque o cabo, instale o driver CP210x ou CH340 (veja o chip perto do USB da placa). Travou em `Connecting...`: segure o botão BOOT até começar a gravar |
| o monitor abre a 921600 | caracteres estranhos: confira `monitor_speed = 921600` no `platformio.ini` |

## 2. Partida (só o ponto A ligado)

Aperte EN (reset) com a máquina **parada** e olhe as primeiras linhas:

```
#inicio PredictSpin firmware 3 sensores
#sensor A: DEVID=0xE5 autoteste OK (dX=... dY=... dZ=... LSB)
#sensor B: DEVID=0x00 (esperado 0xE5): ausente
#sensor C: DEVID=0x00 (esperado 0xE5): ausente
#heap livre depois da partida: ... bytes
#fila: LittleFS ok, 0 lotes guardados, capacidade 3904 janelas
#hora sincronizada por NTP
janela 2026-11-...Z rpm=0 modo=normal | A rms=0.00xx pico=0.0xxx | B --- | C --- | amostras=8000/8000 fila=0 rede=ok http=201
# defasagem_AC_us=0/0 tick_max_us=... ticks_atrasados=0 taxa_Hz=1600.x/0.0/0.0 ...
```

O valor lido em B e C ausentes pode ser `0x00` ou `0xFF`.

| Esperado | Se não acontecer |
|---|---|
| A com `DEVID=0xE5` e `autoteste OK` | `DEVID` diferente de `0xE5` no A: confira a fiação (SCK 18, MISO 19, MOSI 23, CS 5, 3V3 e GND). `autoteste FALHA` com DEVID certo: repita com a máquina parada e sem tocar no sensor; se continuar, anote dX/dY/dZ e troque o sensor |
| B e C `ausente` | se aparecer `FALHA` em B ou C sem sensor ligado, há algo encostado nos pinos 16 ou 17 |
| `LittleFS ok` | `LittleFS FALHOU`: o firmware segue só com a RAM; grave de novo |
| `#hora sincronizada por NTP` em até ~30 s | a tela mostra "sem WiFi": rede ou senha errada em `segredos.h`, ou rede de 5 GHz (o ESP32 só usa 2,4 GHz). "WiFi ok" mas "sem hora": a rede bloqueia NTP (porta UDP 123); use o hotspot. Rede com página de login (portal cativo) não funciona |
| primeira linha `janela` com `http=201` em até 1 min | `http=-1` ou outro negativo: sem conexão HTTPS (URL errada, API dormindo: espere, ela acorda em ~1 min). `http=401` e "CHAVE INVALIDA" na tela: a chave em `segredos.h` não é a do Render; corrija e grave de novo. `http=400`: anote a linha `#erro HTTP 400` inteira |
| `taxa_Hz` do A entre 1568 e 1632 (±2% de 1600) | fora disso, **anote**: é o oscilador do sensor. Abaixo de 1568, todas as janelas saem marcadas como `amostras_incompletas` na exportação (ver docs/firmware.md) |
| `ticks_atrasados=0` e `tick_max_us` bem abaixo de 2000 | atrasos frequentes: anote `tick_max_us` e se acontecem junto com o envio |
| `amostras=` perto de 8000 | muito abaixo: FIFO estourando; anote `tick_max_us` |

Anote também `heap_livre` e `heap_min` depois de alguns envios: é a memória livre real com Wi-Fi e
TLS (a documentação só tem estimativa).

## 3. A janela chegou na API

```powershell
Invoke-RestMethod "$API/api/v1/maquinas/$($maquina.id)/ultima-janela?simulado=false" -Headers $H | ConvertTo-Json -Depth 5
```

| Esperado | Se não acontecer |
|---|---|
| `dispositivo` = `ps-torno-01`, `simulado` = false, `segundos_desde_recebimento` menor que 10 | 404 "Nenhuma janela recebida": o firmware ainda não mandou nada com 2xx; volte ao passo 2 |
| `pontos` só com `A`; `modo` = `normal`; `amostras` e `amostras_esperadas` preenchidos | `pontos` com B ou C: algum sensor foi detectado sem estar ligado |
| `medido_em` no horário UTC atual (Brasília + 3 h) | horário errado: NTP não sincronizou; veja o passo 2 |

## 4. Rotação

Ligue o torno em vazio (T1) numa marcha conhecida e compare a rotação.

| Esperado | Se não acontecer |
|---|---|
| `rpm=` na serial perto da marcha do painel, estável entre janelas | 0 com a máquina girando: o FC-51 não vê a faixa (ajuste a distância e o trimpot até o LED do módulo piscar a cada volta) |
| ordens com valor (`ordens=ok` no diagnóstico) a partir da segunda janela na mesma marcha | `ordens=zero` sempre: variação acima de 5% (`variacao_rot=`); repique ou faixa mal colada. Rotação o dobro da real: duas bordas por volta; confira a faixa |
| rotação volta a 0 em até 2 s depois de parar | — |

## 5. Hibernação da API

O serviço gratuito do Render dorme depois de 15 min sem tráfego. Para ele dormir, o ESP32 precisa
ficar sem enviar:

1. Desligue o hotspot (ou tire o ESP32 da rede) e deixe o ESP32 **ligado** por 20 min. A fila
   cresce (cerca de 240 janelas) e passa para o LittleFS depois de 64.
2. Confira que a API dormiu: no painel do Render o serviço aparece como suspenso, ou o primeiro
   `curl $API/actuator/health` demora.
3. Ligue o hotspot de novo e acompanhe a serial.

| Esperado | Se não acontecer |
|---|---|
| durante a queda: `fila=` subindo, `rede=sem_wifi`, LED de rede âmbar piscando, LED de fila âmbar depois de 1 min | fila parada em 64 e `fila_perdidas` subindo: LittleFS falhou (veja o passo 2) |
| na volta: primeiras linhas `#envio falhou (-11)` ou `(-1)`, com espera de 1, 2, 4... s, enquanto a API acorda (~1 min) | 401 na volta: a chave mudou no Render |
| depois: `http=201`, `envio=recuperacao` na linha `janela` e `fila=` caindo cerca de 4 por segundo até 0 (240 janelas: ~1 min); no painel, o dado ao vivo atrasado até a fila esvaziar, sem o painel cair | fila não desce: anote o código HTTP das linhas `#envio falhou`. Painel caiu (reconectando sem parar): anote a hora; a API devia mandar só eventos `recuperacao` |

Confira que não faltou janela no período (a quantidade esperada é minutos x 12):

```powershell
$de = "2026-11-..T..:..:00Z"; $ate = "2026-11-..T..:..:00Z"   # o período da queda, em UTC
$ponto = ((Invoke-RestMethod "$API/api/v1/maquinas/$($maquina.id)/pontos" -Headers $H).conteudo | Where-Object codigo -eq "A").id
(Invoke-RestMethod "$API/api/v1/pontos/$ponto/telemetria?de=$de&ate=$ate&simulado=false&size=1" -Headers $H).total_elementos
```

## 6. Sem rede por 2 minutos

Desligue o hotspot por 2 min e ligue de novo.

| Esperado | Se não acontecer |
|---|---|
| `fila=` sobe até cerca de 24 e desce a 0 em menos de 15 s depois da volta (ritmo de recuperação, 250 ms entre envios, enquanto a mais antiga tiver mais de 30 s) | a fila desce devagar (uma a cada vários segundos): anote; cada envio deveria levar menos de 1 s com a conexão reaproveitada |
| contagem do período (comando do passo 5) = 24 janelas | faltando janela: anote `fila_perdidas` e `janelas_perdidas` do diagnóstico |

## 7. Modo rápido

```powershell
Invoke-RestMethod -Method Post "$API/api/v1/maquinas/$($maquina.id)/modo-rapido" -Headers $H
```

| Esperado | Se não acontecer |
|---|---|
| a resposta traz `ativo: true` e `modo_rapido_ate` 2 min à frente | 401: o token venceu; entre de novo |
| a partir da segunda janela depois do POST, a serial mostra `modo=rapido` e `amostras=.../1600`, uma linha por segundo; a tela mostra "RAPIDO 1s ate ..." | continua `modo=normal`: confira na resposta da ingestão (`ultima-janela` com `modo`) e se o relógio do ESP32 está certo (passo 3) |
| 2 min depois, volta sozinho a `modo=normal` e 5 s | — |

Teste também o desligamento antes do prazo:

```powershell
Invoke-RestMethod -Method Post   "$API/api/v1/maquinas/$($maquina.id)/modo-rapido" -Headers $H
Invoke-RestMethod -Method Delete "$API/api/v1/maquinas/$($maquina.id)/modo-rapido" -Headers $H
```

Esperado: volta a 5 s na janela seguinte à primeira resposta sem o campo.

## 8. Sinal bruto

Feche o monitor serial (a porta só pode ter um programa) e rode, na raiz do repositório:

```powershell
cd analise
python -m pip install -r requirements.txt
python captura.py --porta COM5 --segundos 10 --saida dados/bancada_A_t1.csv
```

| Esperado | Se não acontecer |
|---|---|
| `Pronto: ~5000 quadros, amostras A: ~1600/s / B: 0/s / C: 0/s` | `Nenhum quadro recebido`: porta errada, ou o firmware gravado é o antigo; para o antigo use `--formato texto` |
| `Quadros perdidos pelo firmware: 0; erros de CRC: 0` | quadros perdidos: o buffer da serial encheu (computador lento lendo); anote. Erros de CRC: cabo ruim |
| depois da captura, a serial volta ao texto (o script manda `bruto 0`) | ficou em binário: abra o monitor e digite `bruto 0` |

Durante a captura as janelas continuam sendo enviadas à API (só a serial muda).

## 9. Batida com a chave

Com a máquina parada e o aprendizado concluído (16 janelas, cerca de 80 s depois da partida; LED
do anel 1 verde, sem azul), dê 3 ou 4 batidas leves com a chave na estrutura, perto do sensor, ao
longo de uma janela.

| Esperado | Se não acontecer |
|---|---|
| `pico=` e `rms=` do ponto batido sobem várias vezes na janela da batida; a curtose (na API) sobe bem acima de 3 | nada muda: o sensor está solto ou é outro ponto (confira qual CS) |
| tela mostra `ATENCAO` no ponto; com batidas em 3 janelas seguidas, `ALARME` e anel 1 vermelho piscando | aprendizado feito com a máquina girando e o teste com ela parada não dispara; aperte BOOT para reaprender na condição do teste |
| `saturou` só se a batida for forte (\|bruto\| ≥ 4090, perto de 16 g) | — |

## 10. Chave errada (opcional)

Grave com `DISPOSITIVO_CHAVE` errada de propósito.

| Esperado | Se não acontecer |
|---|---|
| `#erro HTTP 401`, tela "CHAVE INVALIDA", anel 2 todo vermelho, sem novas tentativas | continua tentando: anote. Grave de novo com a chave certa no fim |

## 11. Com os três sensores

Desligue, ligue B (CS 16) e C (CS 17) e repita os passos 2, 3, 8 e 9.

| Esperado | Se não acontecer |
|---|---|
| A, B e C com `DEVID=0xE5` e `autoteste OK`; anel 2 com os três LEDs de sensor verdes | um sensor `ausente`: CS solto; dois sensores trocados: confira qual pino vai em qual ponto (A=5, B=16, C=17) |
| `taxa_Hz=` dos três perto de 1600, cada um um pouco diferente (osciladores próprios) | — |
| `defasagem_AC_us=` média/máxima: **anote** (a estimativa é ~70 µs; nunca foi medida) | — |
| `amostras=` é a menor das três contagens | — |
| na captura: `A: ~1600/s / B: ~1600/s / C: ~1600/s`, linhas com campos vazios só de vez em quando | um sensor com bem menos amostras: ele ficou sem ler; anote `tick_max_us` |
| batida perto de um sensor mexe mais nele do que nos outros dois | os três iguais: estão presos na mesma peça rígida; normal se a batida for no barramento |

## 12. Calibração de cada sensor (antes de montar)

Faça com o firmware da segunda rodada (a primeira linha da serial mostra `versao 2026-11-17+...`),
o sinal bruto desligado, cada sensor **solto** sobre uma superfície nivelada (a mesa da bancada,
conferida com nível de bolha) e longe de máquina ligada. Calibre um ponto por vez; o sensor continua
ligado ao ESP32 pelo cabo de sempre. Procedimento completo em
[`firmware.md`](firmware.md#calibração-por-sensor).

1. Apoie o sensor com o eixo de análise (Z, perpendicular à face do ímã) **para cima** e digite
   `cal A cima`. Não toque na mesa por 2 s.
2. Vire o sensor de cabeça para baixo (eixo para baixo, apoiado na própria face) e digite `cal A baixo`.
3. Digite `cal A fim`, depois `cal A mostrar`.
4. Repita para B e C, cada um com o cabo dele.
5. Reinicie o ESP32 (EN) e confira na partida a linha `#calibracao: A=A-2026... B=... C=...`.

| Esperado | Se não acontecer |
|---|---|
| `cal A cima ok: média=... desvio=...` com desvio de poucos LSB | `recusada: desvio alto`: a mesa vibrou ou o sensor mexeu; espere a máquina vizinha parar e repita. `fora da faixa`: o sensor não está parado ou o eixo não é o Z; confira a posição |
| `cal A fim` grava com ganho entre 230 e 282 LSB/g (o do datasheet) | `ganho fora de 200 a 320`: as posições foram trocadas (cima/baixo) ou o sensor estava de lado; repita as duas. Ganho entre 200 e 230 ou entre 282 e 320: aceito, mas **anote**: é um sensor fora do típico |
| a tela mostra `CAL A 27x.x LSB/g` por alguns segundos | — |
| depois do reinício, a calibração continua (`#calibracao` com os identificadores) | volta a `nominal`: o LittleFS não gravou (veja a linha `LittleFS FALHOU`) ou o sistema de arquivos foi regravado (`uploadfs` apaga a calibração) |
| a janela seguinte chega na API com `calibracao` e `firmware_versao` (exportação CSV, colunas do fim) | sem os campos: o firmware gravado é o anterior |

| Sensor | Média cima (LSB) | Desvio cima | Média baixo (LSB) | Desvio baixo | Ganho (LSB/g) | Offset (LSB) | Identificador |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |

O ganho medido em 10/11/2026 num sensor (273,5 LSB/g, offset Z +1286 LSB) é só referência: cada
sensor tem o seu.

## 13. Piso de ruído em T0

Com os sensores **montados** nos pontos, o torno **desligado** e a oficina funcionando normalmente
(as outras máquinas como estiverem). É o menor valor que o sistema consegue distinguir.

1. Pelo painel (Coleta), abra um ensaio **T0** real na rotação 0 e grave **5 min** (60 janelas).
   Os três pontos gravam juntos; se só um sensor estiver montado, repita por ponto.
2. Encerre o ensaio, baixe a exportação e rode:

   ```powershell
   Invoke-WebRequest "$API/api/v1/ensaios/exportar.csv?simulado=false" -Headers $H -OutFile exportar.csv
   cd analise
   python bancada.py piso-ruido ..\exportar.csv --ensaios CODIGO_DO_T0
   ```

| Esperado | Se não acontecer |
|---|---|
| 60 janelas por ponto, `vel_rms_mm_s` presente a partir da segunda | menos janelas: a gravação parou (veja a fila na tela). Sem velocidade: firmware anterior |
| o script mostra média, desvio, p95, máximo e o limite (média + 3 desvios) em g e em mm/s | `Nenhuma janela T0`: o ensaio não é T0, não foi encerrado, ou todas as janelas ficaram marcadas (modo rápido ligado durante a gravação) |
| a tabela não muda muito se repetir em outro horário | muda muito: anote o que estava ligado na oficina; o piso é desse ambiente |

| Ponto | Janelas | RMS médio (g) | Desvio (g) | p95 (g) | Máximo (g) | Limite (g) | Vel. média (mm/s) | Vel. limite (mm/s) |
|---|---|---|---|---|---|---|---|---|
| A | | | | | | | | |
| B | | | | | | | | |
| C | | | | | | | | |

**Abaixo do limite nada se afirma:** um RMS ou uma velocidade menor que o limite do ponto não se
distingue da oficina com o torno parado.

## 14. Teste-reteste da montagem

Quanto o valor muda só por tirar e recolocar o sensor. Use **um ponto** (comece pelo B, o mais
mexido no uso) e o torno girando **em vazio (T1)** sempre na **mesma marcha**.

1. Marque com caneta o contorno do ímã na peça, para recolocar no mesmo lugar e na mesma direção.
2. Para cada uma das **5 montagens**: recoloque o ímã no contorno, ligue o torno na marcha escolhida,
   espere 30 s, grave um ensaio T1 de **1 min** (12 janelas), pare o torno e tire o ímã.
3. Encerre os 5 ensaios e rode:

   ```powershell
   python bancada.py teste-reteste ..\exportar.csv --ensaios COD1,COD2,COD3,COD4,COD5
   ```

| Esperado | Se não acontecer |
|---|---|
| sem `AVISO` (todos T1, mesma rotação) | aviso de rotação: algum ensaio foi aberto com outra rotação alvo; refaça esse |
| CV do RMS, da 1X e da velocidade por ponto | CV da 1X `-`: as ordens saíram 0 (rotação instável, veja `variacao_rot` na serial) |

| Ponto | Marcha (rpm) | Montagens | RMS médio (g) | CV RMS | 1X média (g) | CV 1X | Vel. média (mm/s) | CV vel. |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

O CV é a **incerteza de montagem**: uma diferença entre duas condições menor que ele não se separa
da recolocação do sensor.

## 15. Ímã contra fita dupla-face

Mesmo ponto e mesma marcha do item 14, T1.

1. Com o ímã no contorno marcado, grave um T1 de 1 min.
2. Tire o ímã, limpe a superfície, cole o sensor com fita dupla-face no mesmo contorno, grave outro T1
   de 1 min. Anote a fita usada.
3. Compare os dois ensaios na exportação (ou pelo replay no painel), lembrando do CV do item 14.

| Fixação | Ensaio | RMS (g) | 1X (g) | 2X (g) | Vel. (mm/s) | Observação |
|---|---|---|---|---|---|---|
| ímã | | | | | | |
| fita dupla-face (qual) | | | | | | |

| Esperado | Se não acontecer |
|---|---|
| 1X e velocidade parecidos (diferença dentro do CV); o RMS pode diferir mais, porque a fixação muda a resposta em frequência alta | diferença muito maior que o CV também na 1X: a fixação por ímã está mexendo; anote e não use o ímã nesse ponto sem investigar |

## 16. Batida com o cabo da chave

Torno parado. Diferente do item 9 (que confere o alerta), aqui o objetivo é ver a resposta de cada
ponto a um impulso e confirmar que cada sensor está no ponto certo.

1. Ligue a captura do sinal bruto (`python captura.py --porta COM5 --segundos 10 --saida dados/batida_A.csv`).
2. Durante a captura, dê **3 batidas** leves com o **cabo** da chave (não com a parte metálica), a
   cerca de 5 cm do sensor A, uma a cada 2 s.
3. Repita para B e C, cada um com o arquivo dele.

| Ponto batido | Pico no ponto batido (g) | Pico nos outros (g) | Curtose da janela | Observação |
|---|---|---|---|---|
| A | | | | |
| B | | | | |
| C | | | | |

| Esperado | Se não acontecer |
|---|---|
| o ponto batido tem o maior pico; a curtose da janela sobe bem acima de 3 | o maior pico aparece em outro ponto: os cabos estão trocados (CS 5 = A, 16 = B, 17 = C) |
| nenhuma saturação (`saturou` falso) com batida leve | satura: bata mais leve; o fundo de escala é 16 g |

## 17. Banda acima de 800 Hz (captura a 3200 Hz)

**Ainda não dá para fazer:** o firmware não tem o comando de captura a 3200 Hz (item 5.3 da segunda
rodada, não implementado). O script já existe: quando houver uma captura a 3200 Hz,
`python bancada.py banda captura.csv --taxa 3200 --grafico banda.png` dá a fração da energia entre 800
e 1600 Hz, que é a que poderia dobrar para dentro da banda na aquisição normal a 1600 Hz.

| Ponto | Etapa | Fração acima de 800 Hz | Arquivo da captura |
|---|---|---|---|
| A | T1 | | |
| A | T3 | | |

## 18. FC-51 em todas as marchas

Confere a hipótese de que, nas marchas altas, o pulso da faixa refletiva fica curto demais para o
FC-51 (o módulo não especifica tempo de resposta) e a rotação sai errada.

1. Torno em vazio. Para cada marcha da tabela (do menor para o maior), espere 2 janelas e anote da
   linha `#` da serial: `pulso_min_us`, `pulso_medio_us` e `pulsos` (por janela), e o `rpm=` da linha
   `janela`.
2. Se em alguma marcha a rotação sair pela **metade** (ou com variação alta, `ordens=zero`), troque o
   retalho refletivo por uma **faixa branca mais longa**, cerca de **1/8 da volta** da flange, e repita
   a tabela inteira na segunda coluna de resultados.

| Esperado | Se não acontecer |
|---|---|
| `rpm=` igual à marcha nominal com poucos % de diferença em todas as marchas; `pulsos` = voltas na janela (rpm/60 x 5) | rotação pela metade ou `pulsos` abaixo das voltas: o sensor perde pulsos; veja o `pulso_min_us` dessa marcha e troque a faixa (passo 2) |
| `pulso_min_us` diminui com a marcha, sem cair a poucos µs | `pulso_min_us` de poucos µs: repique ou ruído na saída; ajuste o trimpot e a distância |
| a rotação no payload é a mesma de antes (a largura do pulso é só diagnóstico) | — |

| Marcha nominal (rpm) | rpm lido (retalho) | pulso mín. (µs) | pulso médio (µs) | pulsos/janela | rpm lido (faixa 1/8) | pulso mín. (µs) | pulsos/janela |
|---|---|---|---|---|---|---|---|
| 45 | | | | | | | |
| 71 | | | | | | | |
| 90 | | | | | | | |
| 112 | | | | | | | |
| 140 | | | | | | | |
| 180 | | | | | | | |
| 224 | | | | | | | |
| 265 | | | | | | | |
| 280 | | | | | | | |
| 355 | | | | | | | |
| 450 | | | | | | | |
| 560 | | | | | | | |
| 710 | | | | | | | |
| 900 | | | | | | | |
| 1120 | | | | | | | |
| 1400 | | | | | | | |
| 1800 | | | | | | | |
| 2240 | | | | | | | |

Abaixo de ~25 rpm (mais de 2,4 s por volta) a rotação vai a 0 por falta de pulso em 2 s; acima de
4000 rpm o antirrepique descarta as bordas. Confira também a marcha de 265 rpm na placa do torno
(ainda não conferida, ver [`der.md`](der.md)).

## Para registrar

| Item | Valor |
|---|---|
| Data e hora | |
| Rede usada (escola ou hotspot) | |
| Autoteste A, B, C (dX, dY, dZ) | |
| `taxa_Hz` de A, B, C | |
| `tick_max_us`, `ticks_atrasados` | |
| `defasagem_AC_us` (média/máxima) | |
| `heap_livre` e `heap_min` com Wi-Fi e TLS | |
| Tempo até a primeira janela 201 | |
| Hibernação: tempo até a fila esvaziar, janelas faltando | |
| Sem rede 2 min: janelas faltando | |
| Modo rápido: ligou e voltou sozinho (sim/não) | |
| Captura: amostras/s por sensor, quadros perdidos, erros de CRC | |
| Versão do firmware (primeira linha da serial) | |
| Calibração A, B, C (identificador e ganho) | ver item 12 |
| Recuperação: tempo para esvaziar a fila, painel caiu? (sim/não) | |
| Problemas e o que foi feito | |
