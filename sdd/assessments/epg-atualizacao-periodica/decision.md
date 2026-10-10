# Assessment Decision: EPG para de atualizar depois da primeira carga

- **Slug**: epg-atualizacao-periodica
- **Decidido**: 2026-10-09
- **Problem**: ./problem.md
- **Veredito**: go — **como bug** (`sdd-bugfix`), não como feature nova

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Sintoma concreto relatado (guia vazio depois de um tempo, lista Xtream, uso "fecha e reabre"), e casa com a janela guardada de 48 h. Contradiz o que as features 030/031 prometem. |
| Força da evidência | adequate | Relato do usuário + mecanismo plausível lido no código (EPG da abertura amarrado ao `completed` da importação; ramo "EPG vencido" quase morto desde o prazo de 10 min). **Não reproduzido**: a causa exata (importação falhando vs. sincronização de EPG falhando) ainda é hipótese. |
| Valor vs. custo de inação | strong | Sem correção, o guia esvazia em ~48 h e leva Agora/A seguir, guia completo e catch-up. |
| Viabilidade / apetite | strong | Correção provável é pequena e local (`useOpenSource`/`startLocalImport` em `importApi.ts`), testável sem TV; a confirmação na TV usa o caminho `tizen-tv` já funcional. |
| Fit estratégico | strong | Conserta entrega de features já convergidas (030/031); nada novo de arquitetura. |

## Abordagens Candidatas

### 1. Desacoplar o EPG da importação ao abrir (recomendada)

- Ao abrir a lista (e ao voltar ao primeiro plano), checar `isEpgStale`
  **sempre**, não só quando `decideOnOpen` dá `none`; o single-flight do
  `epgRunner` já evita sincronização dupla com a que vem do fim da importação.
  Alternativa equivalente: disparar o EPG também quando a importação termina
  `failed`/`cancelled`.
- Antes, confirmar a causa na TV: estado do EPG em Configurações › Fontes IPTV
  (data da última sincronização × erro `EPG-02`) e, com as credenciais
  `CCPLAY_PROBE_*` do `.env`, tamanho/tempo de `xmltv.php`.
- **Recomendada**: sim — ataca o caminho 3 do `problem.md`, o mais provável
  pelo uso relatado, sem mexer em prazos nem janela.

### 2. Renovação periódica com o app aberto

- Timer que revalida `isEpgStale` de tempos em tempos.
- **Recomendada**: não agora — o uso relatado é "fecha e reabre"; fica como
  ideia futura se aparecer o caso "TV ligada por dias".

### 3. Tornar a falha do EPG visível no guia

- Quando o último estado é `error` e a programação está acabando, mostrar
  isso na Live TV/guia, não só em Configurações.
- **Recomendada**: só se a investigação confirmar o caminho 4 (a própria
  sincronização falhando).

## Veredito

`go`: problema válido e forte, evidência `adequate` (relato + mecanismo no
código, sem reprodução), custo baixo. Mas é **comportamento quebrado de
features já entregues**, não uma ideia a construir — o caminho certo é
`sdd-bugfix`, cuja fase Assess faz a reprodução que falta aqui, e não
`sdd-specify`. A causa exata continua **não confirmada** e é a primeira
coisa que o bugfix precisa fechar.

### Se go — Handoff

- **Problema**: lista Xtream com EPG do painel; o guia esvazia depois de
  ~48 h mesmo com o app sendo fechado e reaberto; a programação parece
  baixada só uma vez.
- **Abordagem recomendada**: reproduzir (estado do EPG em Configurações;
  importação ao abrir terminando `failed`/`cancelled`?; `xmltv.php`
  falhando na TV?), depois desacoplar a sincronização do EPG do desfecho da
  importação ao abrir/voltar ao primeiro plano.
- **Escopo sugerido**: entra — gatilho do EPG na abertura e no primeiro
  plano, teste cobrindo importação `failed`/`cancelled` com EPG vencido.
  Não entra — janela 12/48 h, prazo de 12 h, timer periódico, EPG manual.
- **Métricas de sucesso**: `epgLastSyncAt`/`epgLastErrorAt` avança ao abrir
  com EPG > 12 h mesmo com importação falha; guia com programação depois de
  2+ dias de uso na TV física.
- **Perguntas em aberto pro `sdd-bugfix`**: o estado do EPG na TV está
  "vinculado" com data antiga ou "erro EPG-02"? As importações ao abrir estão
  terminando `completed`?
