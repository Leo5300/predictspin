# Implantação no Render

Data: 10/11/2026. Descreve como publicar a API e o banco no [Render](https://render.com) a partir
do arquivo [`render.yaml`](../render.yaml) da raiz do repositório.

**Situação:** o `render.yaml` está escrito e a mesma imagem Docker foi testada localmente com o
limite de 512 MB e as opções de JVM declaradas nele (ver [Memória](#memória)). Em 11/11/2026 o
responsável informou que a API está publicada; a sessão que atualizou este documento não teve o
endereço e **não conferiu** a publicação. A migração `V3` (firmware de 3 sensores) é aplicada
sozinha pelo Flyway no próximo deploy.

## O que o Blueprint cria

| Recurso | Nome | Plano | Observação |
|---|---|---|---|
| Banco PostgreSQL 16 | `predictspin-db` | `free` | banco `predictspin`, usuário `predictspin` |
| Serviço web (Docker) | `predictspin-api` | `free` | imagem construída de `api/Dockerfile` |

Os dois ficam na região `virginia`, a mais próxima do Brasil entre as oferecidas. A região não pode
ser trocada depois de criada; para usar outra, edite `region` nos dois blocos antes de aplicar.

- **Porta:** o Render define a variável `PORT` (padrão 10000) e a API escuta nela. Não declare
  `PORT` à mão.
- **Health check:** `GET /actuator/health`. O Render só direciona tráfego para a versão nova depois
  que esse endereço responde 200.
- **Banco:** o Render preenche `DATABASE_URL` com a conexão interna
  (`postgresql://usuario:senha@host/banco`) e a API converte para JDBC. As migrações do Flyway
  rodam sozinhas a cada inicialização.
- **Reconstrução:** só commits que mexem em `api/` ou no `render.yaml` disparam nova implantação.

## Passo a passo

1. **Envie o repositório ao GitHub** (`git push`). O Render lê o código de lá.
2. **Gere os segredos** na sua máquina e guarde-os em um gerenciador de senhas. Nenhum deles vai
   para o repositório.

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_SECRET
   python -c "import secrets; print(secrets.token_hex(16))"       # DEVICE_CREDENTIAL_SALT
   python -c "import secrets; print(secrets.token_hex(32))"       # DISPOSITIVO_TORNO_CHAVE
   python -c "import secrets; print(secrets.token_hex(32))"       # DISPOSITIVO_SIM_CHAVE
   ```

3. No painel do Render, escolha **New > Blueprint**, conecte a conta do GitHub e selecione o
   repositório `predictspin`. O Render encontra o `render.yaml` na raiz.
4. O Render pede os valores das variáveis marcadas com `sync: false`. Preencha conforme a tabela
   [Variáveis](#variáveis). Esse pedido acontece **só na criação**; depois, as alterações são feitas
   em **predictspin-api > Environment**.
5. Confirme com **Apply**. O Render cria o banco, constrói a imagem (alguns minutos na primeira
   vez) e inicia a API.
6. Quando o serviço aparecer como **Live**, confira:

   ```bash
   curl https://SEU-SERVICO.onrender.com/actuator/health        # {"status":"UP"}
   ```

   A documentação interativa fica em `https://SEU-SERVICO.onrender.com/swagger-ui`.
7. Entre com o administrador (`POST /api/v1/auth/login` com `ADMIN_EMAIL` e `ADMIN_SENHA`) e crie
   os demais usuários.
8. Opcional: envie algumas janelas simuladas para ver o caminho completo funcionando.

   ```bash
   cd analise
   python simulador.py continuo --url https://SEU-SERVICO.onrender.com --chave CHAVE_DO_SIMULADOR --quantidade 5
   ```

   São dados simulados, gravados com a marca `simulado`; não substituem medição.

## Variáveis

| Variável | Origem | Valor |
|---|---|---|
| `DATABASE_URL` | Render (banco) | preenchida automaticamente |
| `PORT` | Render | preenchida automaticamente |
| `DB_POOL_MAX` | `render.yaml` | `5` |
| `JAVA_OPTS` | `render.yaml` | limites de memória da JVM (ver abaixo) |
| `ADMIN_NOME` | `render.yaml` | `Administrador` |
| `JWT_SECRET` | você | segredo do token, no mínimo 32 caracteres |
| `ADMIN_EMAIL` | você | e-mail do primeiro administrador |
| `ADMIN_SENHA` | você | senha do primeiro administrador, no mínimo 8 caracteres |
| `DEVICE_CREDENTIAL_SALT` | você | sal do hash das chaves de dispositivo |
| `DISPOSITIVO_TORNO_CHAVE` | você | chave do ESP32 (`ps-torno-01`); a mesma vai gravada no firmware |
| `DISPOSITIVO_SIM_CHAVE` | você | chave do simulador (`ps-sim-01`) |
| `CORS_ORIGENS` | você | endereço do painel web, por exemplo `https://painel.exemplo.com`; enquanto não houver painel, use `http://localhost:3000` |

As demais variáveis de [`.env.example`](../.env.example) têm padrão adequado e não precisam ser
declaradas (`JWT_EXPIRATION_MS`, `LOGIN_MAX_TENTATIVAS_EMAIL`, `LOGIN_MAX_TENTATIVAS_IP`,
`LOGIN_JANELA_SEGUNDOS`).

Cuidados:

- **A carga inicial só cria o que ainda não existe.** Mudar `ADMIN_SENHA` ou as chaves de
  dispositivo depois da primeira inicialização não altera o que já está no banco.
- **Não troque `DEVICE_CREDENTIAL_SALT`** depois de criados os dispositivos: as chaves gravadas
  deixam de conferir.
- Trocar `JWT_SECRET` invalida os tokens já emitidos; os usuários só precisam entrar de novo.

## Memória

A instância gratuita tem 512 MB de RAM e 0,1 CPU. O `render.yaml` limita a JVM com:

```
-Xmx220m -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=48m -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError
```

Heap de 220 MB, metaspace de 160 MB e cache de código de 48 MB somam 428 MB e deixam folga para
pilhas de thread e memória nativa. Se a memória acabar, o processo encerra e o Render reinicia o
serviço, em vez de ficar travado.

Medição local, em 10/11/2026, em um notebook com Intel Core i5-1135G7, 7,8 GB de RAM, Windows 11 e
Docker Desktop: contêiner com `--memory=512m --cpus=0.5`, as opções acima e `DB_POOL_MAX=5`.

| Momento | Memória do contêiner |
|---|---|
| Depois de iniciar e de 60 janelas ingeridas em sequência | 303 MiB de 512 MiB |
| Depois de consultas paginadas e do Swagger | 320 MiB de 512 MiB |

A inicialização levou de 91 a 105 s com meio núcleo. Com 0,1 CPU do plano gratuito deve demorar
mais; esse tempo não foi medido no Render.

## Limitações do plano gratuito

Valores lidos na documentação do Render em 10/11/2026 (confira em
<https://render.com/docs/free>, porque mudam):

- **Hibernação:** o serviço web gratuito é desligado depois de 15 minutos sem receber requisição.
  A requisição seguinte o religa, e o Render informa cerca de um minuto para isso, ao qual se soma
  a inicialização da API. **A primeira chamada depois de um período parado pode falhar por tempo
  esgotado.** O simulador repete o envio até três vezes; o firmware precisa fazer o mesmo e não
  pode descartar a janela na primeira falha. Enquanto o ESP32 envia uma janela a cada 5 s, o
  serviço não hiberna.
- **Horas:** 750 horas de instância gratuita por mês em cada conta. Acabando, os serviços gratuitos
  ficam suspensos até o mês seguinte.
- **Banco gratuito expira:** 30 dias depois de criado, com mais 14 dias de carência para migrar a
  um plano pago; depois disso o banco e os dados são apagados. Tem 1 GB de armazenamento, não tem
  backup e só pode existir um por conta. **Antes do prazo, exporte os ensaios**
  (`GET /api/v1/ensaios/exportar.csv`) ou mude o plano do banco.
- **Reinícios:** o Render pode reiniciar o serviço gratuito a qualquer momento. O limite de
  tentativas de login fica em memória e volta a zero em cada reinício.

Para uma demonstração com hora marcada, abra `/actuator/health` alguns minutos antes, para o
serviço já estar acordado.

## Atualizações

Um `git push` na branch conectada com mudança em `api/` dispara nova implantação. O Render mantém a
versão anterior no ar até a nova passar no health check. Migrações novas do Flyway são aplicadas
na subida; migração já aplicada não deve ser editada.

Mudanças no `render.yaml` são aplicadas na sincronização do Blueprint. Variáveis com `sync: false`
não são alteradas por ela.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Implantação falha e o log mostra erro ao validar o segredo do JWT | `JWT_SECRET` vazio ou com menos de 32 caracteres |
| Log mostra `DATABASE_URL inválida` | variável editada à mão em formato diferente de `postgresql://usuario:senha@host:porta/banco` |
| Login do administrador responde 401 logo após a criação | `ADMIN_EMAIL` ou `ADMIN_SENHA` estavam vazios na primeira subida e o usuário não foi criado; corrija as variáveis e reinicie |
| Simulador ou ESP32 recebem 401 | chave diferente da usada na primeira subida, ou `DEVICE_CREDENTIAL_SALT` alterado |
| Serviço reinicia sozinho sob uso | falta de memória; veja a seção [Memória](#memória) |
| Primeira chamada demora ou falha | serviço estava hibernado; repita |
