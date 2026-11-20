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

- **Borda:** ESP32, C++ (Arduino-ESP32 2.0.17, PlatformIO), U8g2, Adafruit NeoPixel
- **Backend:** Java 21, Spring Boot 3.5, PostgreSQL 16, Flyway, JWT (HS256)
- **Testes:** JUnit 5, Testcontainers, JaCoCo, pytest, Unity (testes nativos do firmware), k6
- **Painel web:** React 19, TypeScript 5.9, Vite 8, Tailwind 4, TanStack Query e Router, uPlot,
  cliente gerado do OpenAPI (openapi-typescript e openapi-fetch), Vitest e Playwright
- **Análise:** Python (NumPy, Matplotlib) para processamento offline do sinal bruto e simulador
- **Infra:** Docker Compose (desenvolvimento), GitHub Actions (integração contínua), Render
  (publicação)
- **Mobile (planejado):** React Native

## Status atual

Situação em 16/11/2026.

| Parte | Situação |
|---|---|
| API (`api/`) | Pronta para a coleta e para o firmware de 3 sensores: login, usuários e papéis, máquinas, ingestão de telemetria (com `modo`, `amostras` e `amostras_esperadas` opcionais), modo rápido, consultas, ensaios rotulados, cobertura da coleta e exportação CSV com treino e validação separados; para o painel, documento OpenAPI fiel ao JSON, `GET /auth/eu`, janelas completas, série agregada, eventos ao vivo (SSE) e plano de coleta; catálogos de material e ferramenta, receita do corte no ensaio (correção com histórico) e eventos marcados durante a gravação (migração `V5`); velocidade RMS por ponto e rastreabilidade de cada janela (versão do firmware, calibração e eixo de cada ponto) e evento ao vivo `recuperacao` para o reenvio em massa depois de uma queda de rede (migração `V6`). 251 testes automatizados. |
| Banco | PostgreSQL 16 com o modelo criado pelo Flyway (`V1`), carga inicial (`V2`: máquina `TORNO-01`, pontos A, B e C, canais) e `V3` (condições `desbalanceamento` e `sensor_solto`, modo e amostras da janela, modo rápido da máquina) `V4` (plano de coleta da máquina) `V5` (catálogos, receita do ensaio, histórico de correções e eventos marcados) e `V6` (velocidade RMS em `TELEMETRIA`; versão do firmware, calibração e eixos em `JANELA`). |
| Alerta e ordem de serviço | Regra de z com referência aprendida, alertas ISA-18.2 e OS com retorno do técnico (IA parte A, [`docs/alarmes.md`](docs/alarmes.md)); avaliação numa fila por máquina, fora da resposta da ingestão (19/11/2026). |
| IA: segunda opinião (parte B, 20/11/2026) | Isolation Forest (anomalia) e Random Forest (classe provável) treinados em Python (`analise/treino`, linha de comando ou serviço FastAPI em Docker) e executados na API com ONNX Runtime; botão Treinar com versão, ativação só por ADMIN, validação por ensaio e por dia, comparação com a regra, retorno da OS como rótulo; tendência e fusão com canais lentos prontas e **desabilitadas por configuração** ([`docs/ia.md`](docs/ia.md)). **Só provado com dado simulado**: modelos e limites valem depois dos ensaios rotulados no torno. |
| Firmware (`firmware/`) | Reescrito para 3 ADXL345 e o FC-51: aquisição no núcleo 1 (FIFO a 1600 Hz), características em fluxo, envio HTTPS à API com fila em RAM e LittleFS, modo rápido, tela, LEDs e sinal bruto binário pela serial. Segunda rodada (17/11): calibração de ganho e offset por sensor pela serial, velocidade RMS em mm/s (10 Hz a ~800 Hz, sem comparação com a ISO 20816), versão do firmware e calibração em cada janela, reenvio da fila em ritmo controlado e largura do pulso do FC-51 no diagnóstico. Compila e passa em 77 testes nativos; **nada foi testado em hardware**. Roteiro de bancada, com as medições que viram número para o artigo, em [`docs/teste-bancada-firmware.md`](docs/teste-bancada-firmware.md). |
| Análise (`analise/`) | Captura da serial (`captura.py`, binário de 3 sensores e texto antigo de 1), espectro com janela de Hann e ordens (`espectro.py`), simulador de telemetria (`simulador.py`, que obedece ao modo rápido e manda velocidade estimada e rastreabilidade) e contas de bancada (`bancada.py`: piso de ruído, teste-reteste e banda acima de 800 Hz). |
| Painel web (`painel/`) | **Partes A e B prontas:** leitura (visão geral, máquina com mapa de ordens comparado ao típico de cada linha, ponto com tendência e AO VIVO), coleta de ensaios pelo celular (receita com catálogos, checagem antes de gravar, REC, fita, eventos marcados, sessão T0 → T1 → T2 → T3, matriz de cobertura, exportação CSV), replay de ensaio gravado, diagnóstico (dispositivos, qualidade, catálogos, usuários), alarmes (ISA-18.2), ordens de serviço com retorno do técnico, referência aprendida e diagnóstico da regra de alarme, paleta de comandos (Ctrl+K) e explicações "?". Testado localmente com dados simulados, sem celular real; site estático descrito no `render.yaml`, **não publicado** ([`docs/painel.md`](docs/painel.md)). |
| Aplicativo (`mobile/`) | **Não iniciado.** |
| Integração contínua | Workflow em `.github/workflows/ci.yml` (API, `analise/` e painel: lint, tipos, testes e build); o resultado no GitHub não foi conferido nesta atualização. Os testes nativos do firmware e os de ponta a ponta do painel não estão no CI. |
| Publicação no Render | `render.yaml` (API, banco e painel como site estático) e roteiro escritos; segundo o responsável, a API está publicada (não conferido nesta atualização). O painel ainda não foi publicado. |

Todos os dados de vibração que passaram pela API local até agora são **simulados**. O envio do
ESP32 real ainda não foi feito.

## Estrutura do repositório

```
predictspin
├── api                  backend Spring Boot (código, migrações, testes, Dockerfile)
├── firmware             código do ESP32 (PlatformIO): src/ hardware, lib/ lógica pura, test/ testes nativos
├── painel               painel web (React + Vite): telas, componentes de instrumento, testes
├── analise              scripts Python: captura, espectro, simulador e seus testes
├── carga                teste de carga com k6
├── docs                 arquitetura, modelo de dados, contrato, firmware, implantação, testes
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

### Painel web

Com a API do passo 2 no ar (requer Node 24):

```powershell
python analise/simulador.py continuo --url http://localhost:8080   # janelas simuladas, em outro terminal
cd painel
npm ci
npm run dev                                                         # http://localhost:5173
```

Entre com `ADMIN_EMAIL` e `ADMIN_SENHA`. A fonte começa em **Real** (vazia enquanto o ESP32 não
envia); **Ver dados simulados** mostra as janelas do simulador, sempre marcadas como simuladas. O
endereço da API vem de `VITE_API_URL` (padrão `http://localhost:8080`). Rotas, decisões, direção
visual e o funcionamento dos eventos estão em [`docs/painel.md`](docs/painel.md).

| Rota do painel | Tela |
|---|---|
| `/login` | entrada |
| `/` | visão geral: uma linha por máquina |
| `/maquinas/:id` | máquina: tacômetro, esquema do torno, pontos A, B, C e mapa de ordens |
| `/maquinas/:id/pontos/:codigo` | ponto: leituras, tendência, AO VIVO e janelas do período |
| `/coleta` | coleta: próxima gravação sugerida, matriz de cobertura, gravação (REC, fita, eventos) e resumo (ADMIN e TECNICO) |
| `/coleta/preparar` | preparar a gravação: etapa, condição, rotação, sessão encadeada, receita e checagem antes de gravar |
| `/coleta/ensaios` | ensaios gravados: filtros, receita, eventos, correção com histórico, descarte e CSV |
| `/coleta/ensaios/:id/replay` | replay de um ensaio gravado |
| `/diagnostico` | diagnóstico: dispositivos, qualidade das janelas, catálogos, usuários (ADMIN) e versão |
| `/alarmes` | alarmes e ordens de serviço (hoje diz que a regra de alarme ainda não existe na API) |

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
| `CORS_ORIGENS` | não | `http://localhost:3000,http://localhost:5173` | origens liberadas, separadas por vírgula; `5173` é a porta do painel em desenvolvimento (Vite) |
| `LOGIN_MAX_TENTATIVAS_EMAIL`, `LOGIN_MAX_TENTATIVAS_IP`, `LOGIN_JANELA_SEGUNDOS` | não | `5`, `20`, `900` | limite de tentativas de login com falha |
| `EVENTOS_MAX_POR_USUARIO`, `EVENTOS_MAX_TOTAL` | não | `4`, `20` | conexões de eventos ao vivo (SSE) abertas ao mesmo tempo, por usuário e no total |
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
A descrição completa, com exemplos, está no Swagger (`/swagger-ui`). O documento OpenAPI
(`/v3/api-docs`) descreve o JSON como ele sai (nomes em `snake_case`, enums pelo valor, erros como
`ErroResposta`); um teste de contrato compara as respostas reais com ele.

| Método e rota | Quem acessa | O que faz |
|---|---|---|
| `POST /auth/login` | público | devolve o token JWT; bloqueia depois de várias tentativas com falha |
| `GET /auth/eu` | autenticado | devolve o usuário dono do token; 401 se o token venceu ou o usuário foi desativado |
| `POST /usuarios` | ADMIN | cria usuário (ADMIN, TECNICO ou OPERADOR) |
| `GET /usuarios` | ADMIN | lista usuários |
| `POST /usuarios/{id}/desativar` | ADMIN | desativa um usuário |
| `GET /maquinas` | autenticado | lista máquinas, com as rotações nominais e o plano de coleta |
| `GET /maquinas/{id}` | autenticado | detalhe de uma máquina |
| `GET /maquinas/{id}/pontos` | autenticado | pontos de medição da máquina |
| `GET /maquinas/{id}/dispositivos` | autenticado | dispositivos da máquina |
| `POST /maquinas/{id}/modo-rapido` | autenticado | liga o modo rápido (janelas de 1 s) por 2 min; chamar de novo renova |
| `DELETE /maquinas/{id}/modo-rapido` | autenticado | desliga o modo rápido |
| `GET /maquinas/{id}/modo-rapido` | autenticado | diz se o modo rápido vale e até quando |
| `POST /telemetria` | dispositivo | recebe uma janela; 201 se nova, 200 se reenvio da mesma janela; traz `modo_rapido_ate` enquanto o modo rápido valer |
| `GET /pontos/{id}/telemetria` | autenticado | série de um ponto (`de`, `ate`, `simulado`) |
| `GET /maquinas/{id}/ultima-janela` | autenticado | última janela recebida da máquina |
| `GET /maquinas/{id}/janelas` | autenticado | janelas completas (envio, pontos e canais), paginadas; filtros `de`, `ate`, `simulado`, `modo` e `ordem` |
| `GET /maquinas/{id}/serie` | autenticado | série agregada: o período dividido em `baldes` intervalos iguais (até 600), com média e máximo por ponto; janelas rápidas ficam fora e intervalo sem janela volta vazio |
| `GET /maquinas/{id}/eventos` | autenticado | eventos ao vivo (SSE): `janela`, `recuperacao`, `alerta`, `os`, `ensaio` e `evento_marcado` (só ADMIN e TECNICO) e `modo_rapido`; token no cabeçalho `Authorization` |
| `POST /maquinas/{id}/ensaios` | ADMIN, TECNICO | abre um ensaio rotulado (etapa, condição, rotação) com a receita do corte opcional (material, ferramenta, avanço, profundidade, diâmetro, fluido) |
| `GET /maquinas/{id}/ensaios` | ADMIN, TECNICO | lista os ensaios da máquina; filtros etapa, condição, simulado, aberto, descartado, `material_id` e `ferramenta_id` |
| `GET /ensaios/{id}` | ADMIN, TECNICO | detalhe de um ensaio |
| `POST /ensaios/{id}/encerrar` | ADMIN, TECNICO | encerra o ensaio |
| `POST /ensaios/{id}/descartar` | ADMIN, TECNICO | marca o ensaio como descartado |
| `PATCH /ensaios/{id}/receita` | ADMIN, TECNICO | corrige a receita e a observação; etapa, condição, rotação, simulado e período não mudam (400); cada mudança vai para o histórico |
| `GET /ensaios/{id}/alteracoes` | ADMIN, TECNICO | histórico das correções da receita (campo, valor antigo e novo, quem, quando) |
| `POST /ensaios/{id}/eventos` | ADMIN, TECNICO | marca um evento fora do plano (pancada, cavaco, máquina vizinha, outro) no ensaio aberto; encerrado responde 409 |
| `GET /ensaios/{id}/eventos` | ADMIN, TECNICO | eventos marcados no ensaio |
| `GET /ensaios/{id}/resumo` | ADMIN, TECNICO | estatísticas das janelas do ensaio |
| `GET /ensaios/{id}/janelas` | ADMIN, TECNICO | janelas completas do ensaio em ordem crescente de `medido_em` (replay), paginadas |
| `PUT /maquinas/{id}/coleta/plano` | ADMIN, TECNICO | grava as rotações escolhidas para a grade de cobertura (plano de coleta) |
| `GET /maquinas/{id}/coleta/cobertura` | ADMIN, TECNICO | quantos ensaios válidos há por combinação e quanto falta para a meta; sem `rotacoes`, usa o plano de coleta e, se ele estiver vazio, as rotações já usadas |
| `GET /ensaios/exportar.csv` | ADMIN, TECNICO | exporta as janelas dos ensaios válidos em CSV; colunas `uso` (treino ou validação), `marca` (janela rápida ou com amostras incompletas) e, no fim, a receita e `evento_marcado` |
| `GET /materiais`, `GET /ferramentas` | ADMIN, TECNICO | catálogos da receita, com busca (`busca`) e filtro `ativos` |
| `POST /materiais`, `POST /ferramentas` | ADMIN, TECNICO | cria um item; nome repetido pelo nome normalizado responde 409 com o item existente |
| `PATCH /materiais/{id}`, `PATCH /ferramentas/{id}` | ADMIN | renomeia ou troca a descrição |
| `POST /materiais/{id}/desativar`, `POST /ferramentas/{id}/desativar` | ADMIN | desativa o item (some da escolha; os ensaios continuam apontando para ele) |
| `GET /maquinas/{id}/avaliacao` | autenticado | avaliação da última janela contra a referência: estado, z, típico e % de cada medida, explicação (`simulado`) |
| `GET /maquinas/{id}/referencias` | autenticado | referência em uso: versão, células e cobertura por marcha e etapa (`simulado`) |
| `POST /maquinas/{id}/referencias/recalcular` | ADMIN, TECNICO | gera uma versão nova e imutável da referência (`simulado`) |
| `GET /maquinas/{id}/referencias/versoes` | autenticado | versões da referência, mais recente primeiro |
| `GET /alertas`, `GET /alertas/{id}` | autenticado | alertas ISA-18.2 (filtros máquina, estado, ponto, prioridade, tipo, simulado, período) e detalhe com histórico |
| `POST /alertas/{id}/reconhecer` | autenticado | reconhece o alerta ("eu vi"); não o apaga |
| `POST /alertas/{id}/suprimir`, `POST /alertas/{id}/cancelar-supressao` | ADMIN | silencia com motivo e prazo; volta sozinho ao fim do prazo |
| `GET /alarmes/limites` | autenticado | limites em uso da referência, do alarme e da OS (todos proposta a confirmar) |
| `GET /maquinas/{id}/alarmes/diagnostico` | autenticado | indicadores de desempenho do alarme, severidade, deriva, piso de ruído e calibração por ponto |
| `GET /ordens-servico`, `GET /ordens-servico/{id}` | autenticado | ordens de serviço abertas pela regra; filtros máquina, status, ponto, simulado |
| `POST /ordens-servico/{id}/assumir`, `POST /ordens-servico/{id}/concluir` | ADMIN, TECNICO | assume a OS e conclui com o retorno do técnico (`confirmada` ou `rejeitada`) e comentário |
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

Resultado em 17/11/2026 (Java 21, depois da migração `V6`): **251 testes, nenhuma falha**. Cobertura de
linhas medida pelo JaCoCo (`target/site/jacoco/jacoco.csv`): **98,3 %** nas classes de regra
(`*Service`) e **94,8 %** no projeto inteiro (em 16/11, com 229 testes: 98,2 % e 94,7 %). O build falha se a
cobertura das classes de regra ficar abaixo de 70 %. O relatório fica em
`api/target/site/jacoco/index.html`.

**Painel web.** Os testes de ponta a ponta usam o compose local e ligam o próprio simulador; leem as
credenciais do `.env` e ignoram variáveis de ambiente do computador.

```powershell
cd painel
npm run lint; npm run typecheck; npm test
npx playwright install chromium     # uma vez
npm run test:e2e
```

Resultado em 16/11/2026 (Node 24.14.0, Vite 8.3.8, Vitest 5.1.0): ESLint e TypeScript sem avisos;
**132 testes no Vitest** (15 arquivos), com **97,7 %** das linhas de `src/dominio/` cobertas (provedor
v8, instalado só para a medição, fora do `package.json`); **38 cenários no Playwright**, nenhuma falha.
Inclui o fluxo completo da coleta no celular (390×844, toque emulado), replay, diagnóstico, axe (zero
violações graves ou críticas em todas as telas, nos dois temas), teclado, paleta de comandos e os
piores casos (textos e valores no limite, 100 itens de catálogo, 100 ensaios, plano de 18 rotações,
API fora, ensaio sem janelas, gravação de 10 minutos). `npm audit --omit=dev`: nenhuma
vulnerabilidade. Build de produção: 196 kB (gzip) de JavaScript inicial, rotas carregadas sob demanda,
nenhuma violação da política de segurança; medido com `scripts/medir-producao.mjs`. Revisão de design
em cinco rodadas (quatro por revisores independentes), até não sobrar defeito de direção; números,
prints e achados em [`docs/evidencias/painel/`](docs/evidencias/painel) e [`docs/painel.md`](docs/painel.md).

**Análise (simulador, captura e espectro).**

```powershell
cd analise
pip install -r requirements.txt
python -m pytest -q
```

Resultado em 17/11/2026: **142 testes, nenhuma falha** (simulador, captura, espectro e `bancada.py`).

**Firmware.** Compilação para o ESP32 e testes nativos da lógica pura (precisa de `g++` no PATH;
foi usado o WinLibs, `winget install BrechtSanders.WinLibs.POSIX.UCRT`):

```powershell
cd firmware
copy include\segredos.exemplo.h include\segredos.h   # e preencha; fica fora do Git
python -m pip install platformio
python -m platformio run
python -m platformio test -e native
```

Resultado em 17/11/2026: compila sem erro nem aviso (RAM estática 65.396 bytes, flash 1.118.517
bytes) e **77 testes nativos, nenhuma falha**. Nada disso substitui o teste em hardware.

**Dependências com vulnerabilidade conhecida** (OWASP dependency-check), fora do build normal:

```powershell
$env:NVD_API_KEY = "SUA_CHAVE"
cd api
.\mvnw.cmd -B -P seguranca-dependencias -DskipTests verify
```

Esta verificação **ainda não tem resultado**: a tentativa feita sem `NVD_API_KEY` falhou ao baixar
a base do NVD. A chave é gratuita (<https://nvd.nist.gov/developers/request-an-api-key>).

**Integração contínua.** O workflow roda os testes da API, de `analise/` e do painel (lint, tipos,
Vitest e build) a cada `push` e `pull request`.

## Simulador

> **Os dados do simulador são simulados e nunca substituem medição.** Servem para desenvolver e
> testar o servidor enquanto o firmware não foi conferido em bancada. Saem do dispositivo
> `ps-sim-01` e ficam gravados com a marca `simulado`.

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
python simulador.py roteiro --etapas T1,T3 --condicoes normal,ferramenta_desgastada --rotacoes 400,800 --janelas 12
```

Etapas do protocolo de ensaios, como o simulador as representa:

| Etapa | Situação | No sinal simulado |
|---|---|---|
| `T0` | máquina desligada | só ruído de fundo; rotação zero |
| `T1` | girando em vazio | vibração do acionamento, que cresce com a rotação |
| `T2` | ferramenta se aproximando da peça, sem contato | o mesmo modelo de `T1`: as duas só diferem pelo ruído |
| `T3` | corte | soma o esforço de corte na ferramenta; a condição do ensaio só aparece aqui |

- **`continuo`** envia janelas em sequência. Opções: `--modo` (`normal`, `atencao`, `severo`),
  `--rotacao`, `--etapa` (padrão `T3`), `--condicao`, `--intervalo`, `--quantidade`. Como o
  firmware, obedece ao modo rápido: com `modo_rapido_ate` na resposta, passa a janelas de 1 s até o
  prazo e volta sozinho ao intervalo normal.
- Toda janela leva `modo`, `amostras` e `amostras_esperadas` (1600 por segundo de janela), e também
  `firmware_versao` = `simulado`, `calibracao` = `simulada` e `eixos` = `z` em cada ponto, e
  `vel_rms_mm_s` por ponto. Essa velocidade é uma **estimativa** a partir das ordens 1X a 3X
  (soma quadrática de a/(√2·2π·k·f)), não uma medição nem a conta do firmware.
- **`roteiro`** abre um ensaio para cada combinação, envia as janelas e encerra. Usa o login de
  `ADMIN_EMAIL` e `ADMIN_SENHA` (ou `--email` e `--senha`). Sem opções, percorre as 4 etapas
  (T0 a T3), as 4 condições que ele modela e 3 rotações (`desbalanceamento` e `sensor_solto`
  ainda não são simuladas).
- `--semente` repete a mesma sequência de valores; `--url` e `--chave` trocam o destino.
- `python simulador.py continuo --help` e `python simulador.py roteiro --help` listam tudo.

## Publicação e teste de carga

- **Render:** o [`render.yaml`](render.yaml) descreve a API em Docker e o banco gerenciado. O
  passo a passo, as variáveis e as limitações do plano gratuito estão em
  [`docs/deploy-render.md`](docs/deploy-render.md).
- **Teste de carga:** [`carga/telemetria.js`](carga/telemetria.js) usa o k6 com 20 e 50 usuários
  virtuais, meta de p95 abaixo de 500 ms e menos de 1 % de erro. A otimização de 11/11 (último
  contato do dispositivo gravado no máximo a cada 10 s) tirou a espera por trava da ingestão. No
  diagnóstico local com 50 VUs, o p95 da ingestão passou de 1,04 s para 25 ms. Medições, protocolo
  e o comando para produção em [`docs/teste-de-carga.md`](docs/teste-de-carga.md). Não há medição
  em produção.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | camadas, fluxo de ingestão, decisões |
| [`docs/alarmes.md`](docs/alarmes.md) | filtro de qualidade, referência, regra de alarme, ISA-18.2, OS, indicadores e roteiro de demonstração |
| [`docs/ia.md`](docs/ia.md) | IA parte B: vetor, rótulos, treino, validação, ONNX × Java (memória medida), ativação, segunda opinião, tendência e fusão, roteiro |
| [`docs/painel.md`](docs/painel.md) | painel web: como rodar, decisões, direção visual, tokens, eventos e AO VIVO, revisão, Parte B |
| [`docs/der.md`](docs/der.md) | modelo de dados |
| [`docs/payload.md`](docs/payload.md) | contrato de `POST /api/v1/telemetria` e modo rápido |
| [`docs/firmware.md`](docs/firmware.md) | firmware: pinos, núcleos, filtragem, fila, protocolo serial, limites |
| [`docs/teste-bancada-firmware.md`](docs/teste-bancada-firmware.md) | roteiro do teste de bancada do ESP32 com a API |
| [`docs/deploy-render.md`](docs/deploy-render.md) | implantação no Render |
| [`docs/teste-de-carga.md`](docs/teste-de-carga.md) | teste de carga e medições |

## Licença

A definir.
