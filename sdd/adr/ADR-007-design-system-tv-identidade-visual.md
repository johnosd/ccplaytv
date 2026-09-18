# ADR-007: Design System de TV e Identidade Visual do CCPlayTv

## Status

**Aceita.** Registra formalmente uma decisão já materializada em código
(`tv-web/src/index.css` e `tv-web/src/features/screens.css`) a partir do
protótipo `docs/design/CCPlayTv Prototype - Standalone.html` e das
orientações Samsung compiladas em `docs/guia-praticas-app-tv/`.

"Aceita" significa que o contrato visual e de interação abaixo é a
referência canônica para toda tela nova do CCPlayTv. Não significa
homologação na TV real: nenhum teste de contraste, legibilidade a 3 m ou
desempenho de animação foi executado na Q60D (ver ADR-006 V1/V2).

Complementa — não substitui — a ADR-001 (React/TypeScript/Vite na TV,
`PlayerService`/AVPlay) e a ADR-006 (Norigin Spatial Navigation + TanStack
Virtual como base de foco/virtualização). Esta ADR trata da **linguagem
visual e das regras de estado por superfície**; a ADR-006 trata das
**bibliotecas** que executam a navegação.

## Data

2026-09-16

## Contexto

Até aqui o projeto tinha três fontes de verdade visual desalinhadas e
nenhuma canônica:

1. **O protótipo** `docs/design/CCPlayTv Prototype - Standalone.html` — um
   app React empacotado com 9 telas navegáveis por D-pad (splash, home de
   listas, adicionar lista, hub da lista, Live TV, grade de filmes, detalhe
   de filme, grade de séries, detalhe de série). Contém a paleta, a escala
   tipográfica, os raios de borda e — o mais importante — o **tratamento de
   foco** completo. É um artefato empacotado (671 KB, assets em base64), não
   legível como documentação.
2. **Os guias Samsung** em `docs/guia-praticas-app-tv/` (13 relatórios,
   consulta de 2026-09-13), que impõem restrições normativas de resolução,
   tipografia, foco, rolagem, entrada de texto e player.
3. **O código** já entregue nas features 001 e 002, que implementou os
   tokens do protótipo sem que nenhuma ADR os registrasse.

O risco concreto: cada feature nova re-decidir cor de foco, tamanho de
fonte e comportamento de estado vazio, produzindo telas que parecem de apps
diferentes. Em TV isso é mais grave que em web — o estado de foco é a
**única** forma de o usuário saber onde está (não existe cursor, não existe
hover), e uma tela sem elemento focável prende o controle remoto.

O relatório `docs/iptvnator/01-ui-ux.md` #3 chega à mesma conclusão a partir
de um projeto maduro: "linguagem visual única de seleção via tokens" é o que
dá sensação de produto coeso, e deve ser dirigida por tokens globais, nunca
por cores fixas por componente.

## Decisão

### 1. O protótipo é a referência visual; o CSS é o contrato executável

`docs/design/CCPlayTv Prototype - Standalone.html` define a intenção de
design das 9 telas. A **implementação canônica** dessa intenção são os
tokens em `tv-web/src/index.css` (`:root`) e as regras de componente em
`tv-web/src/features/screens.css`. Quando os dois divergirem, o CSS vence e
a divergência deve ser registrada — o protótipo é um snapshot de 2026-09,
não um artefato vivo.

Nenhuma tela nova define cor, raio ou tipografia literal: consome token.

### 2. Palco fixo 1920×1080 com escala uniforme

A UI é desenhada numa base 16:9 de 1920×1080 e escalada por
`min(innerWidth/1920, innerHeight/1080)`, como no protótipo. Resolução de
interface não é resolução de vídeo: desenhar a UI em 1080p não limita a
qualidade do stream (`docs/guia-praticas-app-tv/04` §1). Conteúdo
interativo fica dentro de ~90% da área (margem de overscan) — nada
essencial encostado na borda.

### 3. Paleta e identidade de marca

```css
--bg: #05060a;               /* fundo do palco */
--surface: #15181f;          /* card em repouso */
--surface-active: #2a2f3c;   /* card selecionado / borda tracejada */
--surface-field-active: #1d212b;

--text-primary: #f5f6f8;
--text-secondary: #a7adbb;
--text-tertiary: #7c8494;
--text-muted: #5c6372;

--accent: #ff7a3d;           /* foco, CTA primário */
--accent-hover: #ffa36b;
--accent-ink: #2a1206;       /* texto sobre accent */

/* gradiente de marca: rosa → laranja → amarelo → verde → azul-petróleo */
--brand-1: #ff2e87; --brand-2: #ff7a3d; --brand-3: #ffc93d;
--brand-4: #3ddc84; --brand-5: #1e9ab0;
```

O gradiente de marca é reservado à identidade (logo, ícone do app, splash).
**Não** é usado como cor de estado da interface — estado é `--accent`
sólido. Tipografia: Poppins para títulos (`--font-heading`), Inter para
corpo (`--font-body`).

Tema escuro é a base, não uma opção: reduz cansaço em sala escura e é o
padrão do gênero. Não há tema claro previsto.

### 4. Foco é o estado mais importante da interface

Receita única, aplicada por token a todo elemento focável — nativamente
focável (`:focus`) ou gerenciado pela tela (`.tv-focus`):

```css
outline: 4px solid var(--accent);
outline-offset: 3px;
box-shadow: 0 0 0 8px rgba(255, 122, 61, .22),
            0 0 40px rgba(255, 122, 61, .55);
transform: scale(1.06);
transition: transform 140ms ease-out, box-shadow 140ms ease-out;
```

O glow é deliberadamente mais forte que o de um app desktop: o foco precisa
ser reconhecível a ~3 m (`docs/guia-praticas-app-tv/01` §1). Foco **nunca**
é comunicado só por mudança de cor (`.../04`, critério de foco), e nunca
por hover — hover não existe neste alvo.

Consequência direta: **focar seleciona, SELECT/Enter executa**. Mover o foco
nunca inicia reprodução, nunca dispara consulta externa
(ADR-006 §4.1; `docs/iptvnator/07-tela-canais.md` #1).

### 5. Estados obrigatórios por superfície

Toda superfície trata explicitamente: `loading`, `vazio`, `erro`,
`selecionado` e `desabilitado`. Duas regras não negociáveis:

- **Todo estado tem pelo menos um elemento focável.** Um estado vazio ou de
  erro sem CTA focável prende o controle remoto
  (`docs/iptvnator/01-ui-ux.md` #6; `docs/guia-praticas-app-tv/08` UX09).
- **"Vazio" e "sem resultado" são estados diferentes**, com mensagem e ação
  diferentes ("adicione uma lista" × "refine a busca")
  (`docs/iptvnator/08-tela-filmes.md` #4).

Carregamento usa skeleton com a **mesma geometria** do item real (zero
reflow), escopado por região — nunca um gate de página inteira. Progresso
determinado só quando existe denominador confiável; caso contrário,
indicação indeterminada, nunca percentual inventado
(`docs/guia-praticas-app-tv/04` §1 e T04).

### 6. Geometria estável: a imagem nunca move o grid

Capas e logos têm área reservada por `aspect-ratio` fixo, com imagem
substituta de mesma dimensão quando ausente. Uma capa que chega depois não
pode alterar as dimensões do card e derrubar a posição de foco
(ADR-006 §4.1; `docs/iptvnator/01-ui-ux.md` #2).

### 7. Escala tipográfica e densidade

Base 1080p, a validar em aparelho: título de página 40–48 px; ação e nome de
card 28–32 px; metadado auxiliar 24–28 px; 5–6 pôsteres por linha como
ponto de partida. Entrelinha 1,2–1,4. Truncamento controlado, com português
acentuado e títulos longos como caso de teste
(`docs/guia-praticas-app-tv/04` §2, T01/T02).

### 8. Custo de animação é restrição, não detalhe

O hardware-alvo é modesto. Transições ficam na faixa de ~140 ms, em
`transform`/`opacity`/`box-shadow`. Evitar blur pesado, glassmorphism e
shimmer contínuo em listas grandes — quando o custo aparecer na medição, o
skeleton vira bloco estático (`docs/iptvnator/09-dashboard-home.md`,
resumo #6).

## Alternativas Consideradas

### Manter o protótipo HTML como única referência, sem ADR

- O arquivo já existe e já foi usado para implementar as features 001/002.
- **Rejeitada:** é um bundle de 671 KB com assets em base64 e o código das
  telas dentro de uma string JS escapada — não é legível nem diffável, e
  não sobrevive como fonte de verdade a uma sessão que precise responder
  "qual é a cor de foco?" sem abrir um navegador. Além disso, um protótipo
  não registra *por que* o glow é mais forte que o de desktop.

### Adotar um kit visual pronto de desktop (Material, shadcn/ui etc.)

- Economizaria a construção de card, campo, diálogo e botão.
- **Rejeitada:** esses kits são desenhados para ponteiro e teclado —
  `:hover` carrega significado, alvos de toque têm ~44 px, e o foco é um
  outline discreto de acessibilidade, não o estado dominante. Adaptá-los ao
  D-pad custaria mais que construir componentes de TV próprios sobre Norigin
  + Virtual, e é exatamente o que a ADR-006 §7 já rejeitou no plano das
  bibliotecas.

### Usar o gradiente de marca como cor de foco

- Daria mais personalidade e amarraria interface e logo.
- **Rejeitada:** um gradiente de 5 cores atrás de um card com capa de filme
  arbitrária não garante contraste em nenhum dos dois extremos, e o custo de
  pintar gradiente animado em dezenas de cards virtualizados é real no
  hardware-alvo. O laranja `--accent` é extraído da mesma paleta e mantém a
  coerência com custo previsível.

### Suportar tema claro além do escuro

- Atenderia salas muito iluminadas.
- **Rejeitada agora:** dobra a matriz de verificação de contraste de foco
  (que já precisa ser testada sobre capas claras, escuras e saturadas —
  `.../04` T07) sem demanda registrada. Revisitável se surgir.

### Escalar a UI por unidades relativas em vez de palco fixo escalado

- Seria mais "web-nativo" e adaptaria a qualquer viewport.
- **Rejeitada:** o alvo é landscape fixo 16:9, e o palco fixo torna a
  geometria previsível — cada medida do protótipo é reproduzível em pixels,
  sem reflow dependente de viewport durante a navegação por foco. Também
  simplifica a matemática de grade que a virtualização consome.

## Consequências

### Positivas

- Uma tela nova herda foco, estados e tipografia sem re-decidir nada; a
  revisão passa a ser "usou token?" em vez de discussão de gosto.
- O critério D02 dos guias ("títulos, foco e ações reconhecíveis na sala de
  teste") vira verificável contra uma receita única, em vez de por tela.
- Tokens globais permitem ajustar a intensidade do foco depois do primeiro
  teste na TV real mudando um lugar só.

### Negativas

- Componentes de TV (card, campo, diálogo, rail, empty state) são código
  próprio a manter — não há biblioteca para atualizar.
- Os valores tipográficos e a contagem de pôsteres por linha são **propostas
  não validadas em aparelho**; podem mudar após o teste de distância, e
  qualquer tela já entregue mudará junto.
- O contraste do foco sobre capas reais (claras, escuras, saturadas) segue
  não testado — é uma dívida de verificação assumida, não um problema
  resolvido.
- Rejeitar tema claro é uma aposta: se o app for usado em ambiente muito
  iluminado, a decisão volta à mesa com telas já construídas.

### Caminho de Migração / Evolução Futura

Revisitar se: (a) o teste de legibilidade a 3 m na Q60D reprovar a escala
tipográfica ou o contraste do foco; (b) a medição de desempenho mostrar que
o `box-shadow` de 40 px do glow custa caro em grades virtualizadas grandes
(alternativa: borda sólida + escala, sem glow); (c) o projeto passar a mirar
outra plataforma de TV com guidelines conflitantes.

Quando o protótipo divergir do código a ponto de confundir, substituí-lo por
um documento de subsistema em `docs/architecture/` (padrão descrito em
`docs/iptvnator/05-documentos.md` #1), mantendo o HTML como referência
histórica e rotulando o que ficou para trás como **dívida de migração, não
precedente** (`docs/iptvnator/04-skills.md` #4).
