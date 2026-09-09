# Claude Glass

[English](README.en.md) · **Português**

Widget de desktop que mostra quanto do seu limite do Claude você já usou, com um
pet de pixel art que reage ao que o Claude Code está fazendo.

---

## O que é

Um widget flutuante e translúcido que fica no canto da tela. Ele lê os logs
locais do Claude Code e mostra:

- quantos tokens você gastou na sessão de 5h e nos últimos 7 dias
- quanto do seu limite isso representa (em %, quando você conecta a conta)
- consumo por modelo nos últimos 7 dias e um mapa dos últimos 30 dias
- um pet que dorme quando você para, trabalha quando o Claude trabalha e pega
  fogo quando o consumo passa do limiar que você definir

Windows 10/11. Requer o [Claude Code](https://claude.com/claude-code)
instalado — é de onde vêm os dados.

## Instalação

**Opção 1 — baixar o pronto**

1. Vá em [Releases](https://github.com/vitoriahellen/Claude-Glass/releases)
2. Baixe o `.zip`, extraia numa pasta de sua preferência
3. Rode `Claude Glass.exe`

O Windows pode exibir "Windows protegeu o computador" porque o executável não é
assinado. Clique em **Mais informações → Executar assim mesmo**.

**Opção 2 — rodar do código**

```bash
git clone https://github.com/vitoriahellen/Claude-Glass.git
cd Claude-Glass
npm install
npm start
```

Para gerar seu próprio executável:

```bash
npm run dist:win
```

O resultado sai em `dist/win-unpacked/Claude Glass.exe` e um `.zip` em `dist/`.

## Conectar a conta (opcional)

Sem conectar, o widget já mostra os **tokens exatos** que você gastou, contados
dos seus próprios logs. Conectando, ele passa a mostrar também a **% real do seu
limite**, vinda da API da Anthropic.

1. Clique na engrenagem ⚙
2. **Entrar pelo navegador** — abre o `claude.ai` no seu navegador padrão
3. Faça login e copie o código que a página mostra
4. Cole no campo e clique em **Conectar**

## Segurança e o seu token

Leia esta seção antes de conectar a conta. Ela é intencionalmente direta.

**O que é seguro**

- **Sua senha nunca passa pelo app.** O login é OAuth com PKCE: você digita a
  senha no `claude.ai`, dentro do seu navegador. O app recebe apenas um código
  de autorização de uso único.
- **Nenhum servidor de terceiros.** O app só conversa com `claude.ai`,
  `platform.claude.com` e `api.anthropic.com`. Não há telemetria.
- **O token não vai para o repositório.** Ele é gravado em
  `%USERPROFILE%\.claude-usage-monitor\auth.json`, fora da pasta do projeto. O
  `.gitignore` não precisa cobri-lo porque ele nunca esteve aqui.

**O que você precisa saber**

- **A permissão de arquivo não protege no Windows.** O código grava o token com
  `mode: 0o600`, mas no Windows o Node só ajusta o atributo somente-leitura —
  não cria ACL. Qualquer processo rodando com o seu usuário consegue ler.
- **O token pode mais do que este app usa.** O escopo pedido é
  `org:create_api_key user:profile user:inference`. O widget só lê o perfil, mas
  o token guardado autoriza **criar uma API key na sua organização**. Se o
  arquivo vazar, dá para gerar chave cobrada da sua conta.
- **O app se identifica como o Claude Code.** Ele usa o `client_id` público e o
  User-Agent do CLI oficial. Não é uma integração registrada de terceiro: a
  Anthropic pode bloquear isso sem aviso, e provavelmente contraria os termos de
  uso. Se você usa conta corporativa, vale conversar com quem administra a
  organização antes.
- **As % estimadas não são oficiais.** Sem conta conectada, a % vem de
  orçamentos calibrados na mão (`usage.js`), não publicados pela Anthropic.
  Podem divergir do painel real. Os **tokens**, esses são exatos.

**Como revogar**

Clicar em **Desconectar** apaga o arquivo local. Para revogar de verdade — se
você suspeitar de vazamento — use as configurações da sua conta Anthropic.

## Configurações

Abra pela engrenagem ⚙.

| Opção | O que faz |
|---|---|
| Iniciar com o Windows | Abre o widget sozinho ao ligar o computador. Ligado por padrão. |
| Alertas | Notificação quando a sessão ou a semana passa de cada limiar |
| Limites de alerta (%) | Os dois níveis que disparam notificação |
| Pegar fogo em (%) | A partir de quanto o pet pega fogo |

## Ícone na bandeja

O Claude Glass fica com um ícone fixo na bandeja do sistema (perto do
relógio), que muda de cor conforme a atividade — colorido quando o Claude
Code está trabalhando, cinza quando está parado. Clique no ícone pra trazer o
widget de volta pra frente.

Clicar no **×** do widget só o esconde (ele continua rodando na bandeja,
igual Slack/Discord). Pra sair de verdade, clique com o botão direito no
ícone da bandeja e escolha **Sair**.

## Desinstalação

O app não usa instalador, então não aparece em "Adicionar ou remover programas".

1. **Desmarque "Iniciar com o Windows"** nas Configurações antes de apagar
   (senão a entrada fica órfã). Se já apagou, remova o atalho em
   `Win+R` → `shell:startup`.
2. Clique com o botão direito no ícone da bandeja e escolha **Sair** (o **×**
   do widget só esconde — não encerra o processo)
3. Apague a pasta onde você extraiu o app
4. Apague os dados: `%USERPROFILE%\.claude-usage-monitor` (o token) e
   `%USERPROFILE%\.claude-glass` (suas configurações)

## Como funciona

O Claude Code grava um `.jsonl` por sessão em `~/.claude/projects`. O widget lê
esses arquivos, soma os tokens por janela de 5h e por 7 dias, e observa o
arquivo mais recente para descobrir o que o Claude está fazendo agora (lendo,
editando, rodando comando, planejando) — é isso que muda a animação do pet.

Quando você conecta a conta, a % passa a vir do endpoint de uso da Anthropic em
vez dos orçamentos estimados.

## Limitações conhecidas

- **Só Windows.** O empacotamento e o auto-início são específicos da plataforma.
- **A % sem login é estimativa.** Ver a seção de segurança.
- **A janela de 5h é inferida**, não lida da API — pode divergir do painel
  oficial em alguns minutos.
- **O executável não é assinado**, então o SmartScreen reclama na primeira
  execução.

## Desenvolvimento

```bash
npm start          # roda em modo dev
npm test           # paridade da bridge + smoke test de cliques
npm run dist:win   # empacota
```

| Arquivo | Responsabilidade |
|---|---|
| `main.js` | processo principal, janela, IPC, notificações |
| `preload.js` | bridge entre main e renderer (`contextBridge`) |
| `usage.js` | lê os `.jsonl` e calcula tokens, sessão, atividade |
| `auth.js` | OAuth PKCE e os endpoints de uso e perfil |
| `renderer/` | UI: `index.html`, `pet.js`, `style.css` |

O `npm test` inclui um teste de paridade entre `preload.js` e o renderer. Ele
existe porque um método faltando na bridge derruba o `pet.js` inteiro no
primeiro uso e mata todos os botões de uma vez — sem erro visível na tela.

## Licença

MIT — veja [LICENSE](LICENSE).
