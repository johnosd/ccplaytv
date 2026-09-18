# Bug Assessment: Live TV toca áudio sem imagem na TV física

- **Slug**: live-tv-toca-audio-sem-imagem
- **Criado**: 2026-09-17
- **Origem**: texto colado — observação direta do usuário na primeira
  reprodução de canal em hardware (sessão de 17/09/2026)
- **Veredito**: valid
- **Severidade**: high

## Report

> "funcionou testei carregou as categorias, e carregou um canal sem imagem
> apenas o so[m]"

Observado na Samsung **QN50Q60DAGXZD** (Tizen 8.0 / Chromium 108), com o
pacote instalado por `sdb` e lançado por `tizen run`, na mesma sessão em que
a correção da tecla Voltar foi verificada
(`sdd/bugs/tecla-voltar-return-nao-funciona-na`).

Contexto que este relato também estabelece, e que é **notícia boa**: as
categorias vieram da fonte real e o `webapis.avplay` abriu o stream, preparou
e tocou áudio. É a primeira execução do AVPlay em aparelho neste projeto — a
porta V1 da ADR-006 deixa de ser "não executada". O que falta é a imagem.

## Symptom

Ao selecionar um canal no Live TV e confirmar com OK, o áudio do canal toca
mas a tela permanece sem vídeo. Esperado: o vídeo preenchendo o palco
1920×1080. Nenhuma tela de erro apareceu — o que significa que o AVPlay não
reportou falha; do ponto de vista do motor, está reproduzindo.

## Reproduction

1. Instalar e lançar o app na TV
   (`tizen install -n CCPlayTv.wgt -t QN50Q60DAGXZD`, depois
   `tizen run -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD`).
2. Na Home, entrar numa lista com OK.
3. Entrar em **Live TV** com OK.
4. Mover o foco até um canal e pressionar **OK**.
5. **Observado**: áudio toca, tela sem imagem, sem mensagem de erro.
   **Esperado**: vídeo visível na área do player.

Não reproduz no navegador de desenvolvimento: lá o `PlayerService` escolhe o
adaptador `<video>`, que é um nó do DOM e desenha dentro da camada web.

## Suspected Code Paths

- `tv-web/src/features/screens.css:552-563` — **causa direta provável**.
  `.player-overlay` pinta `background: var(--player-backdrop)`, que é `#000`
  **opaco** (`tv-web/src/index.css:22`). O AVPlay desenha num plano de
  hardware **atrás** da camada web; qualquer pixel opaco nessa área esconde o
  vídeo. O comentário no próprio bloco justifica o fundo opaco citando o
  plano de hardware — é exatamente a inversão do que a plataforma exige.
- `tv-web/src/index.css:50` — `:root` pinta `background: var(--bg)`. Segunda
  camada opaca sobre a mesma área; mesmo que o overlay ficasse transparente,
  esta continuaria cobrindo.
- `tv-web/src/lib/player/avplayAdapter.ts:100` — `setDisplayRect` **é**
  chamado, com `FULLSCREEN_REGION` (0,0,1920,1080). A região está declarada;
  não é aqui que falta algo.
- `tv-web/src/features/live/PlayerOverlay.tsx:184-187` — o nó
  `#player-surface` existe para o adaptador `<video>` montar o elemento; o
  AVPlay não o usa, como o próprio comentário diz. Não participa da falha.

Camadas que **não** contribuem (verificado): `.screen`
(`screens.css:5-12`) e `#root` (`index.css:67-69`) não declaram `background`;
`body` só declara `margin` e `overflow`.

## Root Cause Hypothesis

A camada web fica por cima do plano de vídeo do AVPlay, e para o vídeo
aparecer a área correspondente precisa ser **transparente de verdade**
(alpha 0). Hoje há duas superfícies opacas sobre ela — `:root` com `--bg` e
`.player-overlay` com `#000` — então o motor reproduz normalmente e o
resultado é invisível; o áudio, que não passa pela composição gráfica,
chega. Confiança: **high**. Sustenta essa leitura o fato de não ter havido
tela de erro: o AVPlay não falhou, e o estado `playing` esconde o rótulo de
status, produzindo exatamente a tela preta silenciosa que foi relatada.

**Hipótese concorrente**, a descartar antes de considerar o bug resolvido:
vídeo em codec não suportado pelo aparelho, com áudio suportado. Menos
provável — nesse cenário o AVPlay normalmente dispara `onerror`, que a
`PlayerOverlay` traduziria em tela de erro com "Tentar de novo"/"Voltar", e
nada disso apareceu. A verificação em hardware distingue as duas de forma
barata: se o fundo transparente revelar a imagem, era composição; se
continuar preto com áudio, é codec e o bug muda de natureza.

## Proposed Remediation

**Preferida**: tornar transparentes as camadas que cobrem o plano de vídeo,
**apenas** enquanto o motor ativo for o que desenha em hardware e a sessão
estiver mostrando vídeo.

Para não violar D-007 do plano da 003 ("as telas não sabem qual motor está
ativo"), a informação deve chegar à UI como **capacidade do adaptador**, não
como identidade do motor: um campo no contrato `PlayerAdapter` (algo como
`rendersOnHardwarePlane: boolean`), `true` no adaptador AVPlay e `false` no
`<video>`, exposto pela sessão. A `PlayerOverlay` reage à capacidade, nunca a
`hasAvplay()` direto.

A transparência precisa alcançar `:root`, e não só o overlay — por isso a
forma mais direta é uma classe alternada em `document.documentElement`
enquanto a camada está mostrando vídeo, com as regras de `background:
transparent` sob essa classe, e remoção garantida na desmontagem.

Aplicar só nos estados em que há vídeo (`buffering`/`playing`): nos estados
`resolving` e `error` o fundo preto deve continuar, porque aí a camada
precisa ser legível e não há plano de vídeo para revelar.

**Alternativas**:
- Trocar o backdrop por um "color key" em vez de transparência — desnecessário
  no Tizen, que compõe por alpha; adicionaria uma cor mágica sem ganho.
- Mover o vídeo para um elemento `<object type="application/avplayer">` —
  muda o modelo de renderização inteiro do player, grande demais para um bug
  e conflita com a abstração atual por coordenadas.

**Files likely to change**:
- `tv-web/src/lib/player/PlayerService.ts`
- `tv-web/src/lib/player/avplayAdapter.ts`
- `tv-web/src/lib/player/htmlVideoAdapter.ts`
- `tv-web/src/features/live/PlayerOverlay.tsx`
- `tv-web/src/features/screens.css`
- `tv-web/src/index.css`
- `tv-web/src/features/live/PlayerOverlay.test.tsx`

**Tests to add or update**:
- A camada aplica a classe de transparência quando o adaptador declara que
  desenha em hardware e o estado tem vídeo.
- A camada **não** aplica a classe com o adaptador `<video>` (desktop) —
  o fundo preto continua.
- A classe é removida ao desmontar a camada e ao cair em estado de erro —
  senão o app inteiro fica transparente sobre o fundo da TV.

## Risks & Considerations

- **Vazamento de transparência**: se a classe não for removida em alguma
  saída (desmontagem, erro, troca de canal), o app inteiro passa a ser
  transparente na TV — falha muito mais visível que o bug original. A
  remoção precisa estar no cleanup do efeito, não só no caminho feliz.
- Teste em jsdom prova a alternância da classe, **não** que o vídeo aparece.
  Igual ao bug do Voltar: a fase Test só pode marcar `verified` com
  reprodução no aparelho.
- ADR-007 é o contrato visual e reserva o fundo escuro do palco; esta
  mudança introduz um estado em que o fundo deixa de ser pintado. É
  deliberado e restrito à camada de reprodução, mas merece nota — se virar
  regra geral, vira assunto de emenda à ADR-007.
- Se a verificação mostrar que a imagem continua ausente com fundo
  transparente, a hipótese de codec assume e o caminho passa a ser registrar
  contêiner/codec do canal e checar contra os limites do aparelho — outro
  bug, não a continuação deste.

## Open Questions

- [NEEDS CLARIFICATION: o canal testado é HLS (`.m3u8`) ou TS bruto, e em que
  codec de vídeo? Não foi registrado na observação. Não bloqueia o fix da
  composição, mas é o dado que decide a hipótese concorrente se a imagem não
  aparecer.]
