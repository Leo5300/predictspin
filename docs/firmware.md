# Firmware de 3 sensores

Data: 11/11/2026. Código em [`firmware/`](../firmware) (PlatformIO, Arduino-ESP32 2.0.17 pela
plataforma `espressif32` 7.1.3).

**Situação:** compila e os testes da lógica pura passam no computador (`pio test -e native`).
**Nada foi testado em hardware.** Este documento descreve o que o código faz; a conferência na
bancada segue [`teste-bancada-firmware.md`](teste-bancada-firmware.md).

## O que faz

Lê os três ADXL345 (pontos A, B e C) e o sensor de rotação FC-51 no mesmo ESP32. A cada janela
(5 s, ou 1 s no modo rápido) calcula RMS, pico, curtose e as amplitudes em 1X, 2X e 3X da
rotação de cada ponto e envia o resumo à API por HTTPS. Mostra o estado numa tela OLED e em
LEDs. O sinal bruto vai para a serial quando pedido.

## Pinos

Placa: ESP32 DOIT DevKit V1 de 30 pinos (ESP32-WROOM-32), num adaptador de bornes. Fonte da
verdade: [`firmware/include/Config.h`](../firmware/include/Config.h).

| Função | Pino | Observação |
|---|---|---|
| SPI SCK, MISO, MOSI | 18, 19, 23 | compartilhado pelos três ADXL345, modo 3, 2 MHz |
| CS do ponto A, B, C | 5, 16, 17 | um por sensor |
| FC-51 OUT | 4 | entrada com pull-down, interrupção na borda de descida (a saída vai a 0 quando a faixa passa) |
| OLED SSD1306 VCC, SCL, SDA | 27, 26, 25 | o pino 27 alimenta a tela; I2C 0x3C, biblioteca U8g2 |
| WS2812 DIN | 32 | 2 módulos de 7 LEDs em cascata (14), 5 V no VIN |
| Botão BOOT | 0 | reaprende o RMS normal |
| Livres para sensores futuros | 13, 14, 33, 21, 22, 34, 35, 36, 39 | não usados |
| Evitados | 12, 15, 2 | interferem no boot |

## Arquitetura de núcleos

| Núcleo | Tarefa | Faz |
|---|---|---|
| 1 | `loop()` do Arduino | espera ativa até o próximo tick (2 ms), esvazia as três FIFO, acumula as características, lê as bordas da rotação, fecha a janela |
| 0 | `rede` (prioridade 2) | Wi-Fi, NTP, fila (RAM + LittleFS), HTTPS, linha da janela na serial, alerta local |
| 0 | `interface` (prioridade 1) | tela a cada 0,5 s, LEDs a cada 50 ms, botão BOOT, comandos da serial |

O núcleo 1 nunca espera a rede. A janela pronta vai para uma fila do FreeRTOS com
`xQueueSend(..., 0)`: se o núcleo 0 estiver atrasado, a janela é perdida e contada
(`janelas_perdidas` no diagnóstico), mas a aquisição não para. A interrupção do FC-51 fica no
núcleo 1 (instalada no `setup()`, que roda nele) e só guarda o instante da borda; o laço repassa
os instantes para o decodificador de rotação. O sinal bruto também sai do núcleo 1, só quando cabe
no buffer de saída da serial (8 KB); escrever com o buffer cheio travaria a aquisição, então o
quadro é descartado e contado.

## Aquisição e filtragem (aliasing)

**Escolha: ODR de 1600 Hz com a FIFO em modo stream** (opção b), no lugar da leitura de um sensor
a 3200 Hz pelo registro de saída.

O firmware anterior configurava o ADXL345 com `BW_RATE = 0x0F` (ODR 3200 Hz) e lia o registro de
saída a 1600 Hz por espera ativa. Pelo datasheet do ADXL345 (Analog Devices, registradores
`BW_RATE` e `FIFO_CTL`), o filtro digital do sensor deixa passar até cerca de ODR/2. Com ODR 3200,
a banda vai até 1600 Hz, e a leitura a 1600 Hz dobra o conteúdo entre 800 e 1600 Hz sobre a banda
de 0 a 800 Hz. Além disso, ler o registro de saída num relógio diferente do relógio do sensor
pega a amostra mais recente com uma defasagem que varia entre 0 e 1/3200 s (até 312 µs), o que vira
ruído de fase no sinal.

As duas alternativas:

| | (a) ler a 3200 Hz e filtrar antes de reduzir | (b) ODR 1600 Hz com FIFO stream |
|---|---|---|
| Antialiasing | filtro digital no ESP32 antes de decimar por 2 | o próprio filtro do sensor corta em ~800 Hz, a Nyquist de 1600 Hz |
| Quem define o instante da amostra | o ESP32, lendo o registro de saída num relógio que não é o do sensor | o oscilador de cada sensor |
| Carga no núcleo 1 | 3 sensores x 3200 leituras/s e o filtro FIR | 3 x 1600 leituras/s, em lotes de ~3 por tick |
| Tolerância a atraso do laço | nenhuma: um tick perdido é amostra perdida | a FIFO guarda 32 amostras (20 ms) |
| Sincronia entre os 3 | amostras no mesmo tick, mas com a defasagem do registro de saída | cada sensor no seu relógio: a contagem por janela varia um pouco entre eles |

A (b) foi escolhida porque o filtro antialiasing já vem do sensor, sem custo, e porque as amostras
ficam regulares no tempo do próprio sensor. O preço é a sincronia. Cada ADXL345 tem oscilador
próprio, e as três contagens de uma janela podem diferir entre si. Por isso:

- os três sensores são lidos no **mesmo tick** de 2 ms, intercalados (A, B, C, A, B, C...). Cada
  amostra fica assim a no máximo um período (625 µs) da amostra correspondente dos outros. A
  defasagem medida entre a primeira leitura do A e a do C em cada tick sai na linha de diagnóstico
  (`defasagem_AC_us` média/máxima). A estimativa pelo tempo de barramento é de cerca de 70 µs;
  **não foi medida**;
- a **taxa de cada sensor é medida** em cada janela (amostras / duração pelo relógio do ESP32,
  `taxa_Hz` no diagnóstico). A janela seguinte usa essa taxa no Goertzel e no comprimento da janela
  de Hann, para que 1X, 2X e 3X caiam na frequência certa mesmo com o oscilador fora do nominal;
- `amostras` no payload é a **menor** contagem entre os sensores presentes, e
  `amostras_esperadas` é 1600 x duração (8000 em 5 s). A API marca na exportação as janelas abaixo
  de 98% das esperadas. **Risco conhecido:** se o oscilador de um sensor estiver mais de 2% abaixo
  do nominal, todas as janelas dele saem marcadas. A primeira coisa a conferir na bancada é o
  `taxa_Hz` de cada sensor;
- a fase entre sensores não é preservada melhor que ±1 amostra. Isso não afeta as características
  por ponto, mas a coerência entre pontos calculada a partir do sinal bruto precisa considerar.

O datasheet pede pelo menos 5 µs entre o fim de uma leitura da FIFO e a próxima leitura do mesmo
sensor. Com mais de um sensor isso é naturalmente atendido pela intercalação; com só o A, o
firmware espera os 5 µs (`PAUSA_FIFO_US`).

## Partida dos sensores

Para cada ponto:

1. lê `DEVID`. Diferente de `0xE5` → **ausente**;
2. roda o **autoteste** do datasheet, com o bit `SELF_TEST` de `DATA_FORMAT`. Faz a média de 100
   leituras sem e com a força eletrostática e compara a diferença com os limites para 3,3 V: os de
   2,5 V do datasheet (X 50 a 540, Y −540 a −50, Z 75 a 875 LSB) multiplicados por 1,77 em X e Y e
   por 1,47 em Z. Fora dos limites → **falha**;
3. com OK, configura ODR 1600 Hz, ±16 g em resolução total, FIFO stream e modo medição.

Sensor ausente ou com falha fica fora do payload (a API aceita de 1 a 3 pontos) e não trava o
firmware. **O firmware funciona só com o ponto A.** O autoteste roda uma vez, na partida: vibração
forte nesse momento pode reprovar um sensor bom; reinicie com a máquina parada.

## Características por janela e por ponto

Calculadas em fluxo, amostra a amostra, sem guardar a janela
([`lib/sinal/Caracteristicas.cpp`](../firmware/lib/sinal/Caracteristicas.cpp)):

| Característica | Como |
|---|---|
| eixo | configurável por ponto em `EIXO_PONTO` (padrão **Z**, perpendicular à face do ímã: é a direção em que a fixação magnética é mais rígida e o sinal chega com menos perda) |
| `rms_g` | raiz da variância (sem o nível DC) x 3,9 mg/LSB |
| `pico_g` | maior \|x − média\| na janela |
| `curtose` | momento central de 4ª ordem / variância²; 3 para sinal gaussiano, 1,5 para senoide pura; 0 se o sinal for constante |
| `o1x`, `o2x`, `o3x` | amplitude de pico em 1X, 2X e 3X da rotação, por Goertzel com janela de Hann |
| saturação | qualquer eixo com \|bruto\| ≥ 4090 marca a janela (`saturou`) |
| escala | 3,9 mg/LSB, constante única `ESCALA_G` |

Os momentos são somas de (x − k) até a 4ª potência em `double`, com k = média da janela anterior,
para não perder precisão com a gravidade no eixo Z.

**Ordens e rotação da janela anterior.** O Goertzel precisa da frequência antes de a primeira
amostra chegar. Por isso as frequências de uma janela são fixadas com a rotação **medida na janela
anterior**. Se a rotação mudar no meio da janela, a ordem calculada fica na frequência antiga.
Para não enviar valor errado, as três ordens vão como **0** quando:

- a rotação da janela anterior ou a da atual é 0 (máquina parada, ou primeira janela);
- a rotação da janela atual difere da anterior em mais de `ROTACAO_LIMITE_VARIACAO` (5%);
- a variação dos períodos dentro da janela ((maior − menor) / médio) passa de 5%.

Na prática, a primeira janela depois de ligar ou de trocar de marcha sai com ordens 0. O campo
`ordens=ok|zero` do diagnóstico mostra o caso.

A janela de Hann tem o comprimento das amostras esperadas na taxa medida do sensor e derruba o
vazamento do DC residual e das ordens vizinhas. A amplitude é normalizada pela soma dos pesos.
Testes nativos conferem as três ordens de um sinal sintético com 1%, 2% e 5% de tolerância, mesmo
com frequência fora de bin inteiro e com 1 g de DC.

## Rotação (FC-51)

O FC-51 é um sensor infravermelho de presença, não de distância: dá 1 pulso por volta quando a
faixa refletiva da flange passa. A rotação vem do período entre bordas
([`lib/rotacao/Rotacao.cpp`](../firmware/lib/rotacao/Rotacao.cpp)):

- **antirrepique:** borda a menos de 15 ms da anterior é ignorada (limite de 4000 rpm);
- `rotacao_rpm` é a média da janela: 60 x 10⁶ x períodos / soma dos períodos, em µs;
- **sem pulso por 2 s**, a rotação volta a 0. Uma borda depois de parada longa recomeça a contagem
  sem formar período;
- abaixo de uma volta por janela (rotação muito lenta), usa o último período, se ainda recente.

## Envio à API

| Item | Como |
|---|---|
| Wi-Fi | até 2 redes em `segredos.h` (escola e hotspot do celular), tentadas na ordem, com reconexão automática. **Rede com página de login (portal cativo) não funciona**: o ESP32 não tem como preencher o formulário |
| Hora | NTP em `pool.ntp.org` e `a.st1.ntp.br`, UTC. **Sem hora sincronizada não envia**: a janela é descartada (`sem_hora` no diagnóstico) e a tela mostra "sem hora". A API recusaria `medido_em` errado |
| `medido_em` | início da janela, ISO-8601 UTC com microssegundos |
| HTTPS | `WiFiClientSecure` com o pacote de certificados raiz (`data/cert/x509_crt_bundle.bin`), **com verificação**. Conexão reaproveitada (`setReuse`) |
| Cabeçalhos | `X-Dispositivo-Id` e `X-Dispositivo-Chave` de `segredos.h` |
| Campos novos | `modo`, `amostras` e `amostras_esperadas` em toda janela |

**Pacote de certificados.** O Arduino-ESP32 2.0.17 traz o verificador (`setCACertBundle`), mas
não o pacote. O arquivo foi gerado pelo
[`ferramentas/gerar_pacote_certificados.py`](../firmware/ferramentas/gerar_pacote_certificados.py)
a partir do `cacrt_all.pem` do ESP-IDF 4.4 (raízes da Mozilla de 26/04/2022, 135 certificados,
incluindo ISRG Root X1/X2 do Let's Encrypt e GTS Root R1 a R4 do Google): 63.376 bytes. Ele é
idêntico, byte a byte, ao gerado pelo `gen_crt_bundle.py` oficial do ESP-IDF. Para atualizar,
rode o script com um PEM mais novo.

### Respostas e fila

| Resposta | O que o firmware faz |
|---|---|
| 2xx (201 nova, 200 reenvio) | sucesso: tira da fila; lê `modo_rapido_ate` |
| 400, 403, 413, 422 | erro de programação: registra na serial (`#erro HTTP ...`), descarta, não reenvia |
| 401 | chave errada: **para de enviar** até reiniciar, mostra "CHAVE INVALIDA" na tela e o anel 2 todo vermelho; a fila fica guardada |
| 5xx, 408, 429, tempo esgotado, falha de conexão | reenvia a **mesma** janela (mesmo `medido_em`; a API não duplica) depois de 1, 2, 4, 8, 16, 32 s e então a cada 60 s |

A fila ([`lib/fila/FilaJanelas.cpp`](../firmware/lib/fila/FilaJanelas.cpp)) guarda as janelas
em ordem:

- **Com rede normal**, as janelas ficam só na RAM (64 lugares). Nada é gravado no flash, e não há
  desgaste.
- **Quando a RAM enche** (mais de 5 min sem enviar), as 32 mais antigas viram um lote em
  `/fila/NNNNNNNN.bin` no LittleFS. A ordem global é: lotes em arquivo, depois a RAM.
- **Na volta da rede**, o lote mais antigo é copiado para a RAM e enviado. O arquivo só é apagado
  quando a última janela dele sai. Se o ESP32 reiniciar no meio, o lote é reenviado inteiro, e a API
  responde 200 às que já tinham chegado.

**Capacidade real:** 120 lotes de 32 janelas mais 64 na RAM = **3904 janelas**, ou seja
**5 h 25 min** a uma janela a cada 5 s. A exigência era aguentar pelo menos 30 min sem rede.

- **Espaço no flash:** cada lote tem 3.592 bytes (cabeçalho de 8 + 32 x 112), num bloco de 4 KB
  do LittleFS. Os 120 lotes usam cerca de 480 KB da partição de 917.504 bytes (`huge_app.csv`).
- **Fila cheia:** o lote mais antigo é descartado e contado (`fila_perdidas`).
- **Reinício:** o que estava só na RAM (até 64 janelas) se perde.

O teste nativo `test_fila_sem_rede_despeja_em_lotes_e_mantem_a_ordem` simula 30 min sem rede
(360 janelas) e confere a ordem na saída.

**Hibernação do Render.** O serviço gratuito dorme depois de 15 min sem tráfego e leva cerca de
1 min para acordar. Com o ESP32 enviando a cada 5 s, ele não dorme. Depois de uma queda, as
primeiras tentativas esgotam o tempo (20 s de resposta) e a fila espera com o atraso crescente. Por
enquanto isso foi visto só no teste nativo da política de envio.

### Modo rápido

Se a resposta trouxer `modo_rapido_ate` no futuro, a janela seguinte passa a 1 s com
`"modo": "rapido"`. Volta sozinha a 5 s quando o prazo passa ou quando uma resposta chega sem o
campo (modo desligado pela API). A troca vale a partir da próxima janela: a atual termina com a
duração que começou.

## Serial

A 921600 baud, 8N1, cabem 92 KB/s. O sinal bruto de 3 sensores em texto CSV
(`t_us,ax,ay,az` x 3 e `ir`) dá cerca de 68 caracteres por amostra x 1600 = 109 KB/s: **não cabe**.

**Escolha: protocolo binário a 921600 baud**, desligado por padrão. A alternativa era texto a
2 Mbaud. O DevKit V1 sai de fábrica com CP2102 ou com CH340, conforme o lote: o CH340 aceita
2 Mbaud, mas o CP2102 (não o CP2102N) vai até 1 Mbaud. Sem saber qual adaptador está na placa da
bancada, o binário a 921600 funciona com os dois. Ele ocupa cerca de 36 KB/s (39% da capacidade):
cabeçalho de 14 bytes por tick de 2 ms e 6 bytes por amostra.

Quadro (little-endian), um por tick:

| Campo | Bytes | Conteúdo |
|---|---|---|
| sincronismo | 2 | `0xA5 0x5A` |
| tipo | 1 | `0x01` (amostras) |
| seq | 1 | sequência, volta a 0 depois de 255 (buraco = quadro perdido) |
| t_us | 4 | `micros()` do tick |
| ir | 1 | nível do FC-51 no tick (0 ou 1) |
| nA, nB, nC | 3 | amostras de cada sensor neste tick (0 a 33) |
| amostras | 6 x (nA + nB + nC) | x, y, z em int16 (LSB), primeiro as do A, depois B, depois C |
| CRC | 2 | CRC-16/CCITT-FALSE (0x1021, início 0xFFFF) de `tipo` até a última amostra |

Comandos pela serial (texto terminado em `\n`):

| Comando | Efeito |
|---|---|
| `bruto 1` | liga o sinal bruto; a serial passa a ser só binária |
| `bruto 0` | desliga |
| `aprende` | reaprende o RMS normal (como o botão BOOT) |
| `estado` | uma linha `#` com o estado atual |

[`analise/captura.py`](../analise/captura.py) manda `bruto 1`, decodifica os quadros e grava
`t_us,ax_A,ay_A,az_A,ax_B,ay_B,az_B,ax_C,ay_C,az_C,ir`. Em cada tick, as linhas são alinhadas
pela amostra mais recente: um sensor com menos amostras naquele tick fica com campos vazios nas
primeiras linhas, e o `t_us` de cada linha é estimado pelo período nominal (625 µs). O formato
antigo de 1 sensor continua com `--formato texto`. O `analise/espectro.py` lê o formato antigo de
5 colunas.

Sem o sinal bruto, a serial mostra uma linha por janela e uma de diagnóstico (começando com `#`):

```
janela 2026-11-11T12:00:00.000000Z rpm=812 modo=normal | A rms=0.0310 pico=0.1120 | B --- | C --- | amostras=8000/8000 fila=0 rede=ok http=201
# defasagem_AC_us=0/0 tick_max_us=... ticks_atrasados=0 taxa_Hz=1600.0/0.0/0.0 amostras=8000/0/0 ordens=ok ...
```

(Exemplo do formato; os números não são medição.)

## Tela e LEDs

Indicação só local; o alarme oficial será da API.

**Tela (128 x 64):** estado de cada sensor (OK, `--` ausente, `FA` falha) e rpm; Wi-Fi e hora UTC
(ou "sem hora"); tamanho da fila, último código HTTP e há quanto tempo; modo rápido e até quando;
RMS, pico e estado do alerta local de cada ponto.

**Alerta local:** por ponto, aprende o RMS médio das primeiras 16 janelas. Depois:

- **atenção:** RMS acima de 1,6 vez a referência;
- **alarme:** 3 janelas seguidas acima disso (escolha para não acender alarme num pico isolado).

O botão BOOT ou o comando `aprende` recomeçam o aprendizado. Aprenda com a máquina na condição
normal de interesse: uma referência aprendida com a máquina parada faz tudo virar alerta quando
ela gira. Referência zero não gera alerta.

**LEDs** (brilho limitado a 25%; estado sempre com cor **e** quantidade ou piscar):

| Anel | Estado | Indicação |
|---|---|---|
| 1 (vibração, pior ponto) | aprendendo | azul, de 1 a 7 LEDs conforme o progresso |
| | normal | 1 LED verde (discreto) |
| | atenção | 4 LEDs âmbar |
| | alarme | 7 LEDs vermelhos piscando a 2 Hz |
| 2, LED 1 | envio ok / sem Wi-Fi ou falhando | verde fixo / âmbar piscando |
| 2, LEDs 2 a 4 | sensor A, B, C | verde = OK, apagado = ausente, vermelho piscando = falha |
| 2, LED 5 | hora | verde = sincronizada, âmbar = sem hora |
| 2, LEDs 6 e 7 | fila | âmbar a partir de 1 min e de 30 min acumulados |
| 2 inteiro | chave recusada (401) | 7 LEDs vermelhos fixos |

Os LEDs ainda não estão soldados: o firmware escreve neles e funciona igual sem eles. A tela
também é opcional.

## Memória

Medida na compilação (`pio run`, 11/11/2026):

| | Usado | Total |
|---|---|---|
| RAM estática | 63.844 bytes (19,5%) | 327.680 bytes |
| Flash (app) | 1.091.333 bytes (34,7%) | 3.145.728 bytes (`huge_app.csv`) |

Da RAM estática, a fila usa 10.800 bytes (64 janelas na RAM e o lote em envio). **Em execução
não foi medido.**

**Estimativa** (não é medida) da memória livre com Wi-Fi e TLS conectados: cerca de 100 a 130 KB.
A conta parte dos 327 KB:

- menos os 64 KB estáticos;
- menos 40 a 55 KB do Wi-Fi;
- menos 35 a 45 KB no pico do handshake TLS (mbedTLS com buffer de entrada de 16 KB);
- menos cerca de 30 KB das pilhas das tarefas (rede 16 KB, interface 6 KB, `loop` 8 KB).

A linha de diagnóstico de cada janela traz `heap_livre` e `heap_min` (o menor valor desde a
partida) para conferir na bancada.

## Compilar, gravar e testar

```powershell
cd firmware
copy include\segredos.exemplo.h include\segredos.h   # e preencha (fica fora do Git)
python -m pip install platformio
python -m platformio run                   # compila
python -m platformio run -t upload         # grava, com o ESP32 no USB
python -m platformio device monitor        # serial a 921600
python -m platformio test -e native        # testes da lógica pura no computador (precisa de g++ no PATH)
```

Os testes nativos cobrem Goertzel nas 3 ordens, RMS/pico/curtose contra valores conhecidos, JSON da
janela, leitura de `modo_rapido_ate`, decisão por código HTTP e espera crescente, decodificador de
rotação, alerta local e a fila (ordem, despejo em lotes, reinício, fila cheia). O `g++` usado foi
o do WinLibs (`winget install BrechtSanders.WinLibs.POSIX.UCRT`).

## Limites conhecidos

- **Nada testado em hardware:** tempos de tick, defasagem entre A e C, taxa real dos osciladores,
  autoteste, Wi-Fi, TLS com o Render, LittleFS, tela e LEDs.
- **Osciladores dos sensores:**
  - se um ADXL345 estiver mais de 2% abaixo de 1600 Hz, todas as janelas dele saem marcadas como
    amostras incompletas na exportação;
  - a fase entre os pontos só vale com ±1 amostra.
- **Ordens:** valem 0 na primeira janela depois de ligar e depois de cada troca de marcha. Rotação
  acima de 4000 rpm é tratada como repique.
- **Autoteste:** roda só na partida e pode reprovar com vibração forte.
- **Portal cativo:** não funciona.
- **Fila:** até 64 janelas na RAM se perdem num reinício sem rede.
- **Chave recusada:** com 401, o envio para até reiniciar o ESP32.
- **Sinal bruto:**
  - o `ir` vai um por tick (2 ms), o que limita a resolução da rotação vista no sinal bruto;
  - o `t_us` de cada amostra é estimado;
  - a saída é só binária: os textos da serial ficam desligados enquanto o sinal bruto está ligado.
- **Pacote de certificados:** são as raízes da Mozilla de 2022. Uma autoridade criada depois disso
  não está no pacote.
