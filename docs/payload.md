# Contrato de ingestão de telemetria

`POST /api/v1/telemetria` — enviado pelo ESP32 (ou pelo simulador) a cada janela de ~5 s, com as
características já extraídas na borda. **Este contrato é fixo:** mudanças que quebrem envio antigo exigem
nova versão da rota. Em 11/11/2026 (migração V3) entraram três campos **opcionais** (`modo`, `amostras`,
`amostras_esperadas`) e o campo de resposta `modo_rapido_ate`; o envio antigo continua válido. Em
17/11/2026 (migração V6) entraram, também **opcionais**, a velocidade `vel_rms_mm_s` por ponto e a
rastreabilidade da janela (`firmware_versao`, `calibracao`, `eixos`).

## Autenticação

Cabeçalhos obrigatórios, independentes do login de usuário:

| Cabeçalho | Exemplo | Observação |
|---|---|---|
| `X-Dispositivo-Id` | `ps-torno-01` | identificador cadastrado em `DISPOSITIVO` |
| `X-Dispositivo-Chave` | `9f1c…` (64 hex) | chave própria do dispositivo; no banco fica só o hash SHA-256 com sal |
| `Content-Type` | `application/json` | |

Dispositivo inexistente, inativo, sem cabeçalho ou com chave errada: **401**.

## Corpo

```json
{
  "dispositivo": "ps-torno-01",
  "medido_em": "2026-11-10T12:00:00Z",
  "rotacao_rpm": 1200.0,
  "saturou": false,
  "pontos": {
    "A": {"rms_g": 0.0, "pico_g": 0.0, "curtose": 0.0, "o1x": 0.0, "o2x": 0.0, "o3x": 0.0},
    "B": {"rms_g": 0.0, "pico_g": 0.0, "curtose": 0.0, "o1x": 0.0, "o2x": 0.0, "o3x": 0.0},
    "C": {"rms_g": 0.0, "pico_g": 0.0, "curtose": 0.0, "o1x": 0.0, "o2x": 0.0, "o3x": 0.0}
  },
  "canais": {"temp_cabecote_c": 0.0, "temp_ferramenta_c": 0.0, "amb_temp_c": 0.0,
             "amb_umid_pct": 0.0, "corrente_a": 0.0}
}
```

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `dispositivo` | texto | sim | igual ao cabeçalho `X-Dispositivo-Id`; diferente → **403** |
| `medido_em` | ISO-8601 com fuso (use UTC, `Z`) | sim | no máximo 5 min no futuro em relação ao servidor; guardado com precisão de microssegundo |
| `rotacao_rpm` | número | sim | 0 a 30 000 |
| `saturou` | booleano | sim | algum acelerômetro bateu no fundo de escala nesta janela |
| `pontos` | objeto | sim, ao menos 1 | chave = código do ponto na máquina do dispositivo (`A`, `B`, `C`); código desconhecido → **400** |
| `pontos.*.rms_g` | número (g) | sim | ≥ 0 |
| `pontos.*.pico_g` | número (g) | sim | ≥ 0 |
| `pontos.*.curtose` | número | sim | adimensional |
| `pontos.*.o1x`, `o2x`, `o3x` | número (g) | sim | ≥ 0; amplitude nas ordens 1X, 2X e 3X da rotação |
| `canais` | objeto | **não** | cada chave também é opcional; chave = código do canal; código desconhecido → **400** |
| `modo` | texto | **não** | `normal` (janela de 5 s) ou `rapido` (janela de 1 s); ausente = `normal`; outro valor → **400** |
| `amostras` | inteiro | **não** | ≥ 0; o **menor** número de amostras lidas entre os sensores nesta janela |
| `amostras_esperadas` | inteiro | **não** | ≥ 1; quantas amostras a janela deveria ter (taxa × duração: 8000 em 5 s, 1600 em 1 s a 1600 Hz) |
| `pontos.*.vel_rms_mm_s` | número (mm/s) | **não** | ≥ 0; velocidade RMS do ponto. No firmware, banda de 10 Hz a ~800 Hz; falta na primeira janela depois da partida ou de uma falta de amostras (ver [`firmware.md`](firmware.md#velocidade-rms-em-mms)) |
| `firmware_versao` | texto | **não** | 1 a 40 caracteres; versão do firmware que mediu a janela (data e hash curto do commit, por exemplo `2026-11-17+76951bf`; `simulado` no simulador) |
| `calibracao` | objeto ponto → texto | **não** | identificador da calibração usada em cada ponto (`A-20261117T143200Z`, `A-semhora-3`, `nominal`); 1 a 40 caracteres, só letras, números e `. _ : + -`; ponto desconhecido → **400** |
| `eixos` | objeto ponto → texto | **não** | eixo do acelerômetro analisado em cada ponto: `x`, `y` ou `z`; outro valor ou ponto desconhecido → **400** |

Exemplo de envio do firmware de 3 sensores (versão de 17/11/2026), só com o ponto A ligado:

```json
{
  "dispositivo": "ps-torno-01",
  "medido_em": "2026-11-11T12:00:00.000000Z",
  "rotacao_rpm": 812.4,
  "saturou": false,
  "modo": "normal",
  "amostras": 8000,
  "amostras_esperadas": 8000,
  "firmware_versao": "2026-11-17+76951bf",
  "calibracao": {"A": "A-20261117T143200Z"},
  "eixos": {"A": "z"},
  "pontos": {"A": {"rms_g": 0.031, "pico_g": 0.112, "curtose": 3.2, "o1x": 0.012, "o2x": 0.004, "o3x": 0.002,
                   "vel_rms_mm_s": 1.85}}
}
```

(Exemplo do formato; os números não são medição.) A API guarda `firmware_versao`, `calibracao` e
`eixos` na janela; nas consultas aparece só a velocidade. O simulador manda `firmware_versao` =
`simulado`, `calibracao` = `simulada` e `eixos` = `z` em cada ponto, e uma velocidade **estimada** a
partir das ordens (não medida).

As janelas com `modo` = `rapido` e as que chegaram com menos de 98% das amostras esperadas ficam
marcadas na exportação (`GET /api/v1/ensaios/exportar.csv`, coluna `marca`) para não entrarem no
treino.

### Exportação dos ensaios (CSV)

Uma linha por janela e ponto, só de ensaios encerrados e não descartados. Ordem das colunas:

1. fixas (desde a V3): `ensaio, etapa, condicao, material, rotacao_alvo_rpm, avanco_alvo, repeticao,
   simulado, maquina, dispositivo, janela_id, medido_em, rotacao_rpm, saturou, ponto, papel, rms_g,
   pico_g, curtose, ordem_1x, ordem_2x, ordem_3x, modo, amostras, amostras_esperadas, uso, marca`;
2. uma por canal da máquina (código do canal, em ordem alfabética);
3. **acrescentadas no fim pela V5**, sem mexer nas anteriores: `ferramenta, profundidade_corte_mm,
   diametro_peca_mm, fluido_corte, evento_marcado`. O material e o avanço da receita já estavam nas
   colunas fixas (`material` passa a ser o nome do item do catálogo);
4. **acrescentadas no fim pela V6**: `vel_rms_mm_s` (vazia quando a janela não trouxe),
   `firmware_versao` e, do ponto da linha, `calibracao` (identificador) e `eixo`.

`evento_marcado` é `true` na janela cujo intervalo contém um evento marcado durante a gravação
(pancada na bancada, cavaco enroscado, máquina vizinha ligada...) e na janela seguinte; `medido_em` é o
início da janela, que dura 5 s (1 s no modo rápido). Essas janelas **devem ficar fora do treino**,
como as que têm `marca` preenchida.

**Conjunto de treino** = `uso = treino`, `marca` vazia e `evento_marcado = false`.

Canais cadastrados no torno `TORNO-01`:

| Código | Grandeza | Unidade |
|---|---|---|
| `temp_cabecote_c` | temperatura (ponto A) | °C |
| `temp_ferramenta_c` | temperatura (ponto B) | °C |
| `amb_temp_c` | temperatura ambiente | °C |
| `amb_umid_pct` | umidade relativa | % |
| `corrente_a` | corrente do motor | A |

Rotação não é canal: é atributo da janela, porque define as ordens 1X/2X/3X.

### Velocidade nas consultas

Onde as consultas já mostram o RMS, a velocidade aparece **só quando a janela a trouxe** (a chave
some, em vez de vir nula):

| Consulta | Campo |
|---|---|
| `GET /maquinas/{id}/ultima-janela`, `GET /maquinas/{id}/janelas`, `GET /ensaios/{id}/janelas` e o evento `janela` | `pontos.*.vel_rms_mm_s` |
| `GET /pontos/{id}/telemetria` | `vel_rms_mm_s` |
| `GET /maquinas/{id}/serie` | `pontos.*.vel_rms_media_mm_s` e `vel_rms_max_mm_s` (das janelas do intervalo que trouxeram) |

## Respostas

| Status | Quando | Corpo |
|---|---|---|
| **201** | janela nova gravada | `{"janela_id": 42, "duplicada": false, "ensaio_id": 7, "medido_em": "…"}` |
| **200** | reenvio: `(dispositivo, medido_em)` já existia; nada é gravado de novo | `{"janela_id": 42, "duplicada": true, …}` |

Enquanto a máquina estiver em **modo rápido**, as respostas 201 e 200 trazem também
`"modo_rapido_ate": "2026-11-11T12:02:00.123456Z"` (UTC). Fora disso o campo **não aparece**.
| **400** | JSON inválido, campo ausente ou fora da faixa, ponto/canal desconhecido, `medido_em` no futuro | erro padronizado, com `campos` |
| **401** | credencial de dispositivo ausente ou inválida | erro padronizado |
| **403** | `dispositivo` no corpo diferente do cabeçalho | erro padronizado |

Erro padronizado:

```json
{
  "timestamp": "2026-11-10T12:00:01Z",
  "status": 400,
  "erro": "Bad Request",
  "mensagem": "Dados inválidos",
  "caminho": "/api/v1/telemetria",
  "campos": [{"campo": "pontos[A].rms_g", "mensagem": "não deve ser nulo"}]
}
```

## Efeitos

- `DISPOSITIVO.ultimo_contato` é atualizado por envio aceito (inclusive reenvio), com resolução de
  10 s: só é regravado quando o valor guardado tem mais de 10 s (ver `docs/teste-de-carga.md`).
- Se a máquina do dispositivo tiver **ensaio aberto**, a janela é gravada com esse ensaio — desde que
  ensaio e dispositivo sejam do mesmo tipo (ambos reais ou ambos simulados). `ensaio_id` na
  resposta indica a associação.
- Grava 1 linha em `JANELA`, 1 em `TELEMETRIA` por ponto e 1 em `LEITURA` por canal, na mesma
  transação.

## Modo rápido (ao vivo)

Um usuário logado (qualquer papel) pede janelas de 1 s para ver a máquina quase em tempo real:

| Rota | Efeito |
|---|---|
| `POST /api/v1/maquinas/{id}/modo-rapido` | liga por 2 minutos a partir de agora; chamar de novo renova |
| `DELETE /api/v1/maquinas/{id}/modo-rapido` | desliga |
| `GET /api/v1/maquinas/{id}/modo-rapido` | `{"maquina_id": 1, "ativo": true, "modo_rapido_ate": "…"}` |

O prazo fica gravado em `MAQUINA.modo_rapido_ate`, e não em memória: vale para todos os
dispositivos da máquina e sobrevive a um reinício da API. O dispositivo descobre o modo pela resposta
da ingestão. Recebendo `modo_rapido_ate` no futuro, passa a janelas de 1 s com `"modo": "rapido"` até
esse instante e volta sozinho a 5 s. O painel é avisado pelo evento `modo_rapido` do fluxo
`GET /api/v1/maquinas/{id}/eventos` (ver [`arquitetura.md`](arquitetura.md#eventos-ao-vivo-sse)).

## Recomendações para o firmware

- Reenvie com o **mesmo** `medido_em` em caso de falha de rede: a API não duplica.
- Trate 2xx (200 e 201) como sucesso e descarte a janela do buffer. Trate 400/403 como erro de
  programação (não reenvie em laço). Reenvie em 5xx e em falha de conexão, com espera crescente.
- Sincronize o relógio por NTP antes de medir.
- Mande `amostras` e `amostras_esperadas` em toda janela; obedeça `modo_rapido_ate` (ver acima).

## Exemplo com curl

```bash
curl -X POST http://localhost:8080/api/v1/telemetria \
  -H "Content-Type: application/json" \
  -H "X-Dispositivo-Id: ps-sim-01" \
  -H "X-Dispositivo-Chave: $DISPOSITIVO_SIM_CHAVE" \
  -d '{"dispositivo":"ps-sim-01","medido_em":"2026-11-10T12:00:00Z","rotacao_rpm":1200.0,"saturou":false,
       "pontos":{"A":{"rms_g":0.12,"pico_g":0.4,"curtose":3.0,"o1x":0.08,"o2x":0.03,"o3x":0.01}}}'
```
