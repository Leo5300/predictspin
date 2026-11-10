# PredictSpin

Monitoramento de condição por vibração multiponto em máquinas rotativas industriais.

Do acelerômetro na máquina à ordem de serviço no Centro de Controle Operacional — um método de
instrumentação e uma plataforma IIoT de ponta a ponta.

## Contexto

O projeto nasceu de uma demanda real da GEOSOL — Geologia e Sondagens S/A, empresa que hoje troca
componentes de sonda de perfuração por tempo de uso, não por condição real do equipamento. A
proposta é substituir manutenção por calendário por manutenção orientada por dado: instrumentar a
máquina com acelerômetros, extrair características do sinal de vibração e transformar isso em
alerta e ordem de serviço, antes da falha acontecer.

O método core do projeto separa, na vibração medida, o que vem do acionamento (motor) daquilo que
vem da interação entre ferramenta e material — o que permite diagnosticar não só se há um problema,
mas se ele está no equipamento ou no processo. A validação é feita em máquinas rotativas reais do
laboratório de mecânica do SENAI (torno e furadeira de coluna), com a sonda de perfuração da
GEOSOL como caso de aplicação de referência.

## Arquitetura

```mermaid
flowchart LR
    subgraph campo[Chão de fábrica]
        S[3x ADXL345<br/>sensor óptico de rotação<br/>sensor de corrente]
    end
    subgraph borda[Borda]
        E[ESP32<br/>aquisição sincronizada<br/>RMS · FFT/Hann · ordens 1X 2X 3X]
    end
    subgraph aplicacao[Aplicação]
        API[Spring Boot<br/>segurança · regras · classificação]
        DB[(PostgreSQL)]
    end
    subgraph consumo[Consumo]
        APP[React Native<br/>operador e técnico]
        CCO[Painel do CCO]
        OS[Ordem de serviço]
    end

    S -->|SPI| E
    E -->|HTTPS/TLS| API
    API --- DB
    API --> APP
    API --> CCO
    API --> OS
```

O diagrama mostra o sistema planejado. O que já existe está em [Status atual](#status-atual).
Detalhes de cada camada, fluxo de ingestão e decisões estruturais estão em
[`docs/arquitetura.md`](docs/arquitetura.md). O modelo de dados está em [`docs/der.md`](docs/der.md).

## Stack

- **Borda:** ESP32, C++ (Arduino framework, PlatformIO)
- **Backend:** Java 21, Spring Boot 3.5, PostgreSQL 16, Flyway, JWT (HS256)
- **Testes:** JUnit 5, Testcontainers, JaCoCo, pytest, k6
- **Análise:** Python (NumPy, Matplotlib) para processamento offline do sinal bruto e simulador
- **Infra:** Docker Compose (desenvolvimento), GitHub Actions (integração contínua), Render
  (publicação)
- **Mobile (planejado):** React Native

## Status atual

Situação em 10/11/2026.

| Parte | Situação |
|---|---|
| API (`api/`) | Pronta para a coleta: login, usuários e papéis, máquinas, ingestão de telemetria, consultas, ensaios rotulados, cobertura da coleta e exportação CSV. 125 testes automatizados. |
| Banco | PostgreSQL 16 com o modelo completo criado pelo Flyway (`V1`) e carga inicial (`V2`: máquina `TORNO-01`, pontos A, B e C, canais). |
| Alerta e ordem de serviço | Tabelas e entidades existem; **ainda não há regra nem rota**. |
| Classificação da condição | **Não iniciada.** |
| Firmware (`firmware/`) | Lê **um** ADXL345 por SPI a 1600 Hz e a referência de rotação e envia o sinal bruto pela serial. **Ainda não** calcula as características na borda **nem envia para a API**. |
| Análise (`analise/`) | Captura da serial (`captura.py`), espectro com janela de Hann e ordens (`espectro.py`) e simulador de telemetria (`simulador.py`). |
| Painel web e aplicativo (`mobile/`) | **Não iniciados.** |
| Integração contínua | Workflow escrito em `.github/workflows/ci.yml`; **ainda não rodou no GitHub**. |
| Publicação no Render | `render.yaml` e roteiro escritos; **implantação ainda não feita**. |

Todos os dados de vibração que passaram pela API até agora são **simulados**. Nenhuma medição real
do torno foi gravada no servidor.

## Estrutura do repositório

```
predictspin
├── api                  backend Spring Boot (código, migrações, testes, Dockerfile)
├── firmware             código do ESP32 (PlatformIO)
├── analise              scripts Python: captura, espectro, simulador e seus testes
├── carga                teste de carga com k6
├── docs                 arquitetura, modelo de dados, contrato, implantação, teste de carga
├── mobile               reservado para o aplicativo (vazio)
├── .github/workflows    integração contínua
├── docker-compose.yml   banco e API para desenvolvimento
├── render.yaml          Blueprint do Render
└── .env.example         modelo das variáveis de ambiente
```

## Como rodar

Requisitos: Docker Desktop ligado. Os comandos abaixo são para PowerShell, a partir da raiz.

1. Crie o arquivo de variáveis e preencha os campos vazios (veja
   [Variáveis de ambiente](#variáveis-de-ambiente)):

   ```powershell
   Copy-Item .env.example .env
   ```

   Para gerar os segredos:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_SECRET
   python -c "import secrets; print(secrets.token_hex(16))"       # DEVICE_CREDENTIAL_SALT, DB_PASSWORD
   python -c "import secrets; print(secrets.token_hex(32))"       # DISPOSITIVO_TORNO_CHAVE, DISPOSITIVO_SIM_CHAVE
   ```

2. Suba o banco e a API:

   ```powershell
   docker compose up -d --build
   ```

3. Espere a API terminar de iniciar e confira:

   ```powershell
   curl.exe http://localhost:8080/actuator/health     # {"status":"UP"}
   ```

   A documentação interativa fica em <http://localhost:8080/swagger-ui>.

4. Entre com o administrador definido em `ADMIN_EMAIL` e `ADMIN_SENHA`:

   ```powershell
   $corpo = @{ email = "EMAIL_DO_ADMIN"; senha = "SENHA_DO_ADMIN" } | ConvertTo-Json
   $login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/auth/login `
     -ContentType "application/json" -Body $corpo
   Invoke-RestMethod -Uri http://localhost:8080/api/v1/maquinas `
     -Headers @{ Authorization = "Bearer $($login.token)" }
   ```

Para parar: `docker compose down`. Para parar e apagar os dados do banco: `docker compose down -v`.

Se a porta 5432 já estiver ocupada na sua máquina, mude `DB_PORT` no `.env`; ela só afeta o acesso
ao banco de fora do compose.

## Variáveis de ambiente

Nenhum segredo fica no repositório. Tudo vem de variáveis de ambiente, listadas em
[`.env.example`](.env.example). O `.env` é ignorado pelo Git.

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | não | `localhost`, `5432`, `predictspin`, `predictspin` | conexão com o banco (no compose a API usa o host `db`) |
| `DB_PASSWORD` | sim | | senha do banco |
| `DATABASE_URL` | não | | conexão inteira (`postgresql://usuario:senha@host:porta/banco`), como o Render entrega; se preenchida, vale no lugar das `DB_*` |
| `DB_POOL_MAX` | não | `10` | tamanho máximo do pool de conexões |
| `PORT` | não | `8080` | porta HTTP da API |
| `JWT_SECRET` | sim | | segredo do token, no mínimo 32 caracteres |
| `JWT_EXPIRATION_MS` | não | `86400000` | validade do token (24 h) |
| `CORS_ORIGENS` | não | `http://localhost:3000` | origens liberadas, separadas por vírgula |
| `LOGIN_MAX_TENTATIVAS_EMAIL`, `LOGIN_MAX_TENTATIVAS_IP`, `LOGIN_JANELA_SEGUNDOS` | não | `5`, `20`, `900` | limite de tentativas de login com falha |
| `JAVA_OPTS` | não | | opções da JVM (memória) |
| `ADMIN_NOME` | não | `Administrador` | nome do primeiro administrador |
| `ADMIN_EMAIL`, `ADMIN_SENHA` | sim | | primeiro administrador, criado na primeira subida; senha com no mínimo 8 caracteres |
| `DEVICE_CREDENTIAL_SALT` | sim | | sal do hash das chaves de dispositivo; não troque depois |
| `DISPOSITIVO_TORNO_CHAVE` | sim | | chave do ESP32 (`ps-torno-01`) |
| `DISPOSITIVO_SIM_CHAVE` | sim | | chave do simulador (`ps-sim-01`) |
| `PREDICTSPIN_URL` | não | `http://localhost:8080` | endereço da API usado pelo simulador |
| `NVD_API_KEY` | só para a verificação de dependências | | chave gratuita da base NVD |

A carga inicial só cria o que ainda não existe: mudar `ADMIN_SENHA` ou as chaves de dispositivo
depois da primeira subida não altera o que já está no banco.

## Endpoints

Base: `/api/v1`. Corpo e resposta em JSON com nomes em `snake_case`. As listas são paginadas
(`page`, `size`; tamanho máximo 200) e voltam em um envelope com `conteudo` e os dados da página.
A descrição completa, com exemplos, está no Swagger (`/swagger-ui`).

| Método e rota | Quem acessa | O que faz |
|---|---|---|
| `POST /auth/login` | público | devolve o token JWT; bloqueia depois de várias tentativas com falha |
| `POST /usuarios` | ADMIN | cria usuário (ADMIN, TECNICO ou OPERADOR) |
| `GET /usuarios` | ADMIN | lista usuários |
| `POST /usuarios/{id}/desativar` | ADMIN | desativa um usuário |
| `GET /maquinas` | autenticado | lista máquinas |
| `GET /maquinas/{id}/pontos` | autenticado | pontos de medição da máquina |
| `GET /maquinas/{id}/dispositivos` | autenticado | dispositivos da máquina |
| `POST /telemetria` | dispositivo | recebe uma janela; 201 se nova, 200 se reenvio da mesma janela |
| `GET /pontos/{id}/telemetria` | autenticado | série de um ponto (`de`, `ate`, `simulado`) |
| `GET /maquinas/{id}/ultima-janela` | autenticado | última janela recebida da máquina |
| `POST /maquinas/{id}/ensaios` | ADMIN, TECNICO | abre um ensaio rotulado (etapa, condição, rotação) |
| `GET /maquinas/{id}/ensaios` | ADMIN, TECNICO | lista os ensaios da máquina |
| `GET /ensaios/{id}` | ADMIN, TECNICO | detalhe de um ensaio |
| `POST /ensaios/{id}/encerrar` | ADMIN, TECNICO | encerra o ensaio |
| `POST /ensaios/{id}/descartar` | ADMIN, TECNICO | marca o ensaio como descartado |
| `GET /ensaios/{id}/resumo` | ADMIN, TECNICO | estatísticas das janelas do ensaio |
| `GET /maquinas/{id}/coleta/cobertura` | ADMIN, TECNICO | quantos ensaios válidos há por combinação e quanto falta para a meta |
| `GET /ensaios/exportar.csv` | ADMIN, TECNICO | exporta as janelas dos ensaios válidos em CSV |
| `GET /actuator/health` | público | situação da API |
| `GET /swagger-ui`, `GET /v3/api-docs` | público | documentação |

O dispositivo não usa token: identifica-se com os cabeçalhos `X-Dispositivo-Id` e
`X-Dispositivo-Chave`. O contrato da ingestão está em [`docs/payload.md`](docs/payload.md).

Dados reais e simulados nunca se misturam: toda janela e todo ensaio levam a marca `simulado`,
herdada do dispositivo que enviou, e as consultas e a exportação filtram por ela.

## Testes

**API.** Requer Java 21 e Docker ligado (os testes de integração sobem um PostgreSQL 16 com
Testcontainers).

```powershell
cd api
.\mvnw.cmd -B verify
```

Resultado em 10/11/2026: **125 testes, nenhuma falha**. Cobertura de linhas medida pelo JaCoCo:
**99,2 %** nas classes de regra (`*Service`) e **92,3 %** no projeto inteiro. O build falha se a
cobertura das classes de regra ficar abaixo de 70 %. O relatório fica em
`api/target/site/jacoco/index.html`.

**Simulador.**

```powershell
cd analise
pip install -r requirements.txt
python -m pytest -q
```

Resultado em 10/11/2026: **82 testes, nenhuma falha**.

**Dependências com vulnerabilidade conhecida** (OWASP dependency-check), fora do build normal:

```powershell
$env:NVD_API_KEY = "SUA_CHAVE"
cd api
.\mvnw.cmd -B -P seguranca-dependencias -DskipTests verify
```

Esta verificação **ainda não tem resultado**: a tentativa feita sem `NVD_API_KEY` falhou ao baixar
a base do NVD. A chave é gratuita (<https://nvd.nist.gov/developers/request-an-api-key>).

**Integração contínua.** O workflow roda os testes da API e do simulador a cada `push` e
`pull request`. Ainda não foi executado no GitHub.

## Simulador

> **Os dados do simulador são simulados e nunca substituem medição.** Servem para desenvolver e
> testar o servidor enquanto o firmware não envia telemetria. Saem do dispositivo `ps-sim-01` e
> ficam gravados com a marca `simulado`.

O simulador lê o `.env` da raiz para completar endereço, chave e usuário. As opções vêm depois do
modo (`continuo` ou `roteiro`).

```powershell
cd analise
pip install -r requirements.txt

# Uma janela a cada 5 s, até Ctrl+C
python simulador.py continuo

# Cinco janelas com vibração elevada, uma por segundo
python simulador.py continuo --modo severo --intervalo 1 --quantidade 5

# Ensaios rotulados para cada combinação de etapa, condição e rotação
python simulador.py roteiro --etapas T1,T2 --condicoes normal,ferramenta_desgastada --rotacoes 400,800 --janelas 12
```

- **`continuo`** envia janelas em sequência. Opções: `--modo` (`normal`, `atencao`, `severo`),
  `--rotacao`, `--etapa`, `--condicao`, `--intervalo`, `--quantidade`.
- **`roteiro`** abre um ensaio para cada combinação, envia as janelas e encerra. Usa o login de
  `ADMIN_EMAIL` e `ADMIN_SENHA` (ou `--email` e `--senha`). Sem opções, percorre as 4 etapas
  (T0 a T3), as 4 condições e 3 rotações.
- `--semente` repete a mesma sequência de valores; `--url` e `--chave` trocam o destino.
- `python simulador.py continuo --help` e `python simulador.py roteiro --help` listam tudo.

## Publicação e teste de carga

- **Render:** o [`render.yaml`](render.yaml) descreve a API em Docker e o banco gerenciado. O
  passo a passo, as variáveis e as limitações do plano gratuito estão em
  [`docs/deploy-render.md`](docs/deploy-render.md). A implantação ainda não foi feita.
- **Teste de carga:** [`carga/telemetria.js`](carga/telemetria.js) usa o k6 com 20 e 50 usuários
  virtuais, meta de p95 abaixo de 500 ms e menos de 1 % de erro. Como rodar e a medição local de
  referência estão em [`docs/teste-de-carga.md`](docs/teste-de-carga.md). Não há medição em
  produção.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | camadas, fluxo de ingestão, decisões |
| [`docs/der.md`](docs/der.md) | modelo de dados |
| [`docs/payload.md`](docs/payload.md) | contrato de `POST /api/v1/telemetria` |
| [`docs/deploy-render.md`](docs/deploy-render.md) | implantação no Render |
| [`docs/teste-de-carga.md`](docs/teste-de-carga.md) | teste de carga e medições |

## Licença

A definir.
