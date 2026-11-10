# Contrato de ingestão de telemetria

`POST /api/v1/telemetria` — enviado pelo ESP32 (ou pelo simulador) a cada janela de ~5 s, com as
características já extraídas na borda. **Este contrato é fixo:** mudanças exigem nova versão da rota.

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

Canais cadastrados no torno `TORNO-01`:

| Código | Grandeza | Unidade |
|---|---|---|
| `temp_cabecote_c` | temperatura (ponto A) | °C |
| `temp_ferramenta_c` | temperatura (ponto B) | °C |
| `amb_temp_c` | temperatura ambiente | °C |
| `amb_umid_pct` | umidade relativa | % |
| `corrente_a` | corrente do motor | A |

Rotação não é canal: é atributo da janela, porque define as ordens 1X/2X/3X.

## Respostas

| Status | Quando | Corpo |
|---|---|---|
| **201** | janela nova gravada | `{"janela_id": 42, "duplicada": false, "ensaio_id": 7, "medido_em": "…"}` |
| **200** | reenvio: `(dispositivo, medido_em)` já existia; nada é gravado de novo | `{"janela_id": 42, "duplicada": true, …}` |
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

- `DISPOSITIVO.ultimo_contato` é atualizado a cada envio aceito (inclusive reenvio).
- Se a máquina do dispositivo tiver **ensaio aberto**, a janela é gravada com esse ensaio — desde que
  ensaio e dispositivo sejam do mesmo tipo (ambos reais ou ambos simulados). `ensaio_id` na
  resposta indica a associação.
- Grava 1 linha em `JANELA`, 1 em `TELEMETRIA` por ponto e 1 em `LEITURA` por canal, na mesma
  transação.

## Recomendações para o firmware

- Reenvie com o **mesmo** `medido_em` em caso de falha de rede: a API não duplica.
- Trate 2xx (200 e 201) como sucesso e descarte a janela do buffer. Trate 400/403 como erro de
  programação (não reenvie em laço). Reenvie em 5xx e em falha de conexão, com espera crescente.
- Sincronize o relógio por NTP antes de medir.

## Exemplo com curl

```bash
curl -X POST http://localhost:8080/api/v1/telemetria \
  -H "Content-Type: application/json" \
  -H "X-Dispositivo-Id: ps-sim-01" \
  -H "X-Dispositivo-Chave: $DISPOSITIVO_SIM_CHAVE" \
  -d '{"dispositivo":"ps-sim-01","medido_em":"2026-11-10T12:00:00Z","rotacao_rpm":1200.0,"saturou":false,
       "pontos":{"A":{"rms_g":0.12,"pico_g":0.4,"curtose":3.0,"o1x":0.08,"o2x":0.03,"o3x":0.01}}}'
```
