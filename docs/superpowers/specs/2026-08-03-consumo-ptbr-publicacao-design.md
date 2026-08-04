# Claude Glass — consumo visível, pt-BR e publicação no GitHub

Data: 2026-08-03
Status: aguardando revisão da autora antes do plano de implementação

## Contexto

O widget mostra o pet e o mapa de 30 dias, mas o bloco de limites (sessão de 5h
e semana) fica **inteiramente oculto** para quem não conectou a conta —
`style.css:502` esconde `#limits-meters` quando o body não tem a classe `live`.
Sem login a pessoa vê só o botão "Conectar conta".

Isso desperdiça dado que já existe: `usage.js` lê os `.jsonl` do Claude Code e já
calcula `session.tokens`, `week.tokens`, `session.pct` e `week.pct` localmente. O
`pet.js` descarta as duas porcentagens de propósito (comentário em `pet.js:421`:
"% comes only from the connected account — no estimates").

Pré-requisito já entregue: a bridge `preload`/`renderer` estava incompleta e
derrubava o `pet.js` na linha 554, matando todos os listeners de clique.
Corrigido com `onConfig` e `onDebugState`.

## Objetivos

1. Ver quanto já foi gasto na sessão e na semana, com ou sem conta conectada.
2. Interface inteiramente em português BR, incluindo formato numérico.
3. Repositório publicável: README, licença, `.gitignore` e auto-início honesto.

## Não-objetivos

- Custo em dinheiro (R$/US$). Descartado: no plano Max a cobrança é assinatura
  fixa, então qualquer valor seria "equivalente API" — informação que confunde
  mais do que ajuda.
- Traduzir as animações decorativas do pet. Elas imitam a tela real do Claude
  Code, que é em inglês; traduzir quebraria a metáfora.
- Publicar o repositório. O push fica com a autora.

---

## A. Consumo da sessão e da semana

### Regra central

Os **tokens são sempre exatos** — vêm dos logs locais, não dependem de login.
Apenas a **porcentagem** é estimada quando não há conta conectada, porque ela
depende do orçamento do plano.

| Dado | Sem conexão | Conectada |
|---|---|---|
| Tokens | logs locais — exatos | logs locais — exatos |
| % | `PLAN_BUDGETS[config.plan]` — estimada, prefixo `~` | API da Anthropic — exata |

A marcação de incerteza fica na %, nunca no número de tokens.

### Layout

```
sessão atual                 ~32%
[███████░░░░░░░░░░░░░░]
47,2M tokens · estimado · reset em 2h 14m

semanal · todos modelos      ~41%
[█████████░░░░░░░░░░░░]
1,4B tokens · estimado · últimos 7 dias

[ 🔗 Conectar conta
     para ver a % real do seu limite ]
```

Conectada, o `~` e o "estimado" desaparecem e o botão de conectar some (regra
`body.live #limits-connect` já existente).

### Mudanças

**`style.css`** — remover as duas regras que ocultam conteúdo sem login:
`body:not(.live) #limits-meters` e `body:not(.live) #mini-pct-row`.

**`pet.js` / `render()`** — trocar a origem dos valores:

- `sessPct` = `realUsage.session.pct` se conectada, senão `d.session.pct`
- `wkPct` = `realUsage.week.pct` se conectada, senão `d.week.pct`
- idem para os `resetMs`
- prefixo `~` nas duas porcentagens quando `!liveOn`
- sublinhas ganham `· estimado` quando `!liveOn`
- `#mini-pct` mostra `~32%` em vez de `—`

Caso de borda: sem sessão de 5h ativa, `d.session.active` é `false` e os tokens
são 0. A sublinha continua mostrando "sem sessão ativa" — não inventar `~0%`
como se fosse medição.

### Seletor de plano

A estimativa depende de `config.plan`, hoje fixo em `"max5x"` e sem controle na
interface. Adicionar ao painel de Configurações:

```
Plano    [ Pro ][ Max 5x ][ Max 20x ]
         base para estimar a % sem conta conectada
```

Três botões segmentados, não `<select>`: no Windows o `<select>` nativo renderiza
uma caixa branca opaca que destoa do card translúcido, e o CSS já tem padrão de
botão para reaproveitar.

Persistido via `saveConfig({ plan })`. O `usage.js` já lê `config.plan` para
escolher o orçamento, então o backend não muda. O reenvio de `config` após salvar
(entregue no fix da bridge) faz a barra reagir na hora, sem reiniciar.

O estado "sujo" do botão Salvar (`snapshotSettings`) precisa incluir o plano.

---

## B. Português BR

### Traduzir

| Onde | De | Para |
|---|---|---|
| `index.html:2` | `lang="en"` | `lang="pt-BR"` |
| `index.html:224,233` | `idle` | `ocioso` |
| `index.html:225` | `session` | `sessão` |
| `index.html:237` | `live` | `ao vivo` |
| `pet.js:563` | `error` | `erro` |
| `pet.js:152` | `now` | `agora` |
| `pet.js:639` | `Checking…` | `Verificando…` |
| `pet.js:621` | aviso de rate limit | tradução |
| `pet.js:622` | `Failed: …` | `Falhou: …` |

### Formato numérico

`fmtTokens` produz `47.2M` com ponto decimal. Em pt-BR o separador é vírgula:
`47,2M`. Vale o ajuste justamente porque é o número central da feature A.

Sufixos `k` / `M` / `B` permanecem — são convenção técnica reconhecida e
traduzir "B" para "bi" tornaria a leitura mais longa num card de 276px.

### Manter em inglês

As animações decorativas (`Running`, `Reading files`, `README.md`, `# Getting
Started`) e o nome do produto "Claude Glass".

---

## C. Publicação

### `.gitignore`

Obrigatório antes do primeiro commit: `dist/` e `node_modules/` somam 945 MB.

```
node_modules/
dist/
*.log
.DS_Store
Thumbs.db
```

### `LICENSE`

O `package.json` declara MIT mas não existe o arquivo. Sem ele o padrão legal é
"todos os direitos reservados" e ninguém pode usar. Adicionar MIT em nome de
Vitória Silva.

### Auto-início honesto

`main.js:228-230` força o registro na inicialização do Windows a cada abertura,
sem controle na interface. Se a pessoa desativar nas Configurações do Windows, o
próximo start reativa. Aceitável em uso pessoal, inaceitável num app público.

Substituir por:

- campo `startWithWindows` no config, **padrão `true`** — abrir junto com o
  Windows é o comportamento desejado para um widget de monitoramento, e é o que
  a autora quer
- checkbox "Iniciar com o Windows" nas Configurações, marcado por padrão
- `main.js` aplica `setLoginItemSettings({ openAtLogin: config.startWithWindows })`
  na inicialização e ao salvar — respeitando a escolha em vez de impor

O que muda em relação a hoje não é o padrão, é a **reversibilidade**: continua
abrindo sozinho, mas desmarcar a caixinha realmente desliga, em vez de ser
sobrescrito na próxima abertura.

### README

`README.md` em português + `README.en.md` em inglês, com link entre eles no topo.

Seções:

1. O que é — captura de tela e uma frase
2. Instalação — baixar o zip do Releases, ou rodar do código (`npm install`,
   `npm start`, `npm run dist:win`)
3. Conectar a conta — o fluxo OAuth e o que ele destrava
4. **Segurança e seu token** — seção destacada, ver abaixo
5. Configurações — plano, alertas, limiar do fogo, auto-início
6. Desinstalação — fechar o app, apagar a pasta, apagar
   `%USERPROFILE%\.claude-usage-monitor` e `%USERPROFILE%\.claude-glass`,
   desmarcar o auto-início
7. Como funciona — lê os `.jsonl` locais do Claude Code; a % vem da API quando
   conectada
8. Limitações conhecidas

### Seção de segurança do README

Precisa ser honesta, não tranquilizadora. Conteúdo obrigatório:

- A senha nunca passa pelo app — OAuth PKCE, login no navegador da pessoa.
- O token fica em `%USERPROFILE%\.claude-usage-monitor\auth.json`, **fora do
  repositório**. Nunca commitar.
- O `mode: 0o600` de `auth.js:42` **não protege no Windows** — o Node só ajusta
  o atributo somente-leitura, sem ACL. Qualquer processo do mesmo usuário lê.
- O escopo pedido é `org:create_api_key user:profile user:inference`. O app só
  usa o perfil, mas o token guardado autoriza **criar API key na organização**.
  Se vazar, dá para gerar chave cobrada da conta.
- O app usa o `client_id` do Claude Code e o User-Agent `claude-cli/2.1.181` —
  não é integração registrada de terceiro. A Anthropic pode bloquear sem aviso e
  isso provavelmente contraria os termos de uso.
- As porcentagens estimadas usam orçamentos não publicados pela Anthropic
  (`usage.js:165-167` admite serem estimativas).
- Como revogar: "Desconectar" apaga o arquivo local; para revogar de verdade,
  usar as configurações da conta Anthropic.

---

## Testes

Estender o smoke test em Electron que já carrega o `preload` e o `renderer` reais
e dispara cliques de verdade:

1. medidores visíveis sem conexão
2. `~` presente na % sem conexão e ausente com `real-usage` recebido
3. tokens exibidos nos dois casos
4. trocar o plano altera a estimativa e dispara `save-config` com o `plan` certo
5. checkbox de auto-início persiste
6. nenhuma string em inglês no painel de dados (varredura de textos, ignorando
   os SVGs decorativos)

O teste de paridade da bridge (`preload` × `renderer`) entra no repositório como
`npm test`, já que foi ele que pegou o bug que derrubava todos os botões.

## Riscos

**A % estimada pode divergir do painel oficial.** Os orçamentos do `PLAN_BUDGETS`
são calibrações não oficiais. Mitigação: prefixo `~`, rótulo "estimado" e aviso
no README. Os tokens, esses são exatos.

**O card cresce ~60px sem conexão**, já que medidores e botão passam a coexistir.
O `fitSize()` reajusta a janela sozinho.

**Publicar amplifica o risco do item 3 da seção de segurança.** Enquanto era uso
pessoal o risco era da autora; público, vira instrução para terceiros e fica
visível para a Anthropic. Decisão da autora, documentada no README.
