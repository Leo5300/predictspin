# Teste de bancada: ESP32 → API no Render

Roteiro para conferir o firmware de 3 sensores no laboratório do SENAI, com o dispositivo real
`ps-torno-01`. Primeiro só com o ponto A ligado (passos 1 a 10), depois com os três (passo 11).
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
| depois: `http=201` e `fila=` caindo até 0 | fila não desce: anote o código HTTP das linhas `#envio falhou` |

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
| `fila=` sobe até cerca de 24 e desce a 0 em poucos segundos depois da volta | a fila desce devagar (uma a cada vários segundos): anote; cada envio deveria levar menos de 1 s com a conexão reaproveitada |
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
| Problemas e o que foi feito | |
