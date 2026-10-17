# Casca mobile-first do portal (077) — layout, navegação, resumo e estados

Delimita o "como" que um executor erraria. Contratos executáveis: `portal-web/e2e/shell.redesenho-portal-web.contract.spec.ts` (casca, ID lembrado) e `portal-web/e2e/listas.redesenho-portal-web.contract.spec.ts` (Listas).

## 1. Breakpoints e geometria (mobile-first: `min-width`, nunca `max-width`)

| Faixa | Navegação | Conteúdo |
| --- | --- | --- |
| `< 960 px` (celular e tablet) | **barra inferior** `position: fixed; inset-inline: 0; bottom: 0`, 3 itens iguais, altura ≥ 56 px (item ≥ 44 px), `padding-bottom: env(safe-area-inset-bottom)` | coluna única; `padding-bottom` do conteúdo = altura da barra + área segura (nada fica escondido atrás dela) |
| `≥ 960 px` (PC) | **menu lateral** à esquerda, `position: sticky; top: 0; height: 100dvh`, largura 15–18 rem (< 320 px), itens com rótulo e ícone | conteúdo à direita, largura máxima `var(--page-width)` (75 rem), resumo da TV no topo do conteúdo |

- Sem rolagem horizontal desde 320 px: `min-width: 0` nos filhos de grid/flex, textos longos com `overflow-wrap: anywhere`, nada com largura fixa maior que 100%.
- A barra e o menu são **o mesmo** `<nav aria-label="Principal">` (um único elemento, só o CSS muda); os itens são `<a>`/`<button>` com texto visível (ícone `aria-hidden`).
- Itens: **Listas, Licença, Ajustes**, nessa ordem; o atual tem `aria-current="page"` e destaque por forma (barra/preenchimento) além de cor.
- Tokens: só os de `styles/tokens.css` (herdados do DS V14: `--bg-*`, `--text-*`, `--accent`, `--space-*`, `--radius-*`, `--fs-*`, `--control-h`, `--focus-ring`). Nenhum literal de cor, raio, espaçamento ou fonte novo. Tema escuro apenas.
- Alvos de toque ≥ 44 px (`--control-h` sobe de 40 para 44 no CSS base), campos com `font-size ≥ 16px` (o navegador do celular não dá zoom), espaçamento entre alvos ≥ 8 px.
- `prefers-reduced-motion`: sem animação além de fade curto; foco visível sempre (`:focus-visible`, anel `--focus-ring`); nada depende de `:hover`.

## 2. Navegação (sem biblioteca de rotas)

- Estado `{ destination: 'lists' | 'license' | 'settings', view?: sub-tela }` em memória, espelhado no `history` com `pushState(estado, '', location.pathname + location.search)` (**URL não muda**: o servidor só serve `/`; nada de caminhos novos). `popstate` restaura o estado: o botão Voltar do celular fecha editor/sub-tela e depois volta ao destino anterior.
- Trocar de destino faz `pushState`; trocar para o destino atual não empilha. Abrir editor de lista ou uma página de Ajustes (TMDB, Backup, Código, Ajuda) empilha uma entrada.
- Ao mudar de destino/sub-tela, o foco vai para o título (`h1`, `tabIndex={-1}`) da nova tela e o scroll volta ao topo; ao voltar de uma sub-tela, o foco volta ao controle que a abriu (por `data-focus-key`, como já é feito em `SourceManager`).
- Retorno do Checkout (`?checkout=return`): abre **Licença** e limpa a query (comportamento atual de `main.tsx`).
- Sem sessão: só a entrada (sem barra, sem resumo). Sessão encerrada/expirada: volta à entrada com o ID lembrado.
- Telas de edição (editor de lista, formulário da chave TMDB) **substituem** a barra inferior por uma barra de ações própria (`Salvar`/`Cancelar`, alvo ≥ 44 px, `position: sticky; bottom: 0`) para não empilhar com o teclado virtual; no PC o menu lateral continua.

## 3. Resumo da TV (`<section aria-label="Resumo da TV">`)

Campos, nesta ordem: **ID da TV** (`displayId`, monoespaçado), **Licença** (rótulo `status-badge` + validade `dd/mm/aaaa`), **Último contato** (data/hora relativa do `snapshot.capturedAt`; sem snapshot = "Ainda sem contato").

| Situação | Aparência | Ação |
| --- | --- | --- |
| licença `trial` | selo neutro "Período de teste" | — |
| `active` | selo verde "Licença ativa" + validade | — |
| vencida (`expiresAt ≤ agora`) ou `revoked` | selo vermelho "Licença vencida" | o resumo vira um link/botão "Renovar" que leva a Licença |
| snapshot ausente ou `stale` (≥ 24 h) | linha de atenção "Sem contato recente: abra o app na TV e aperte Atualizar" | — |
| falha ao ler o dispositivo | linha de erro com "Tentar de novo" | — |

- Mobile: colapsado em duas linhas (ID + selo; último contato abaixo); PC: três colunas. Sempre visível no topo da rolagem do conteúdo (não fixo no celular, para não roubar altura).
- Uma única fonte de dados: `useTvSummary` (`GET /session/device` + `snapshot` do `useDashboard`) com atualização a cada 10 s só com a aba visível e ao voltar o foco; `LicensePage`/`SourceManager` deixam de ter timers próprios.

## 4. Estado de integração com a TV (FR-007)

Linha curta sob qualquer item enviado (cartão de lista, chave TMDB). Texto e ícone, nunca só cor.

| Origem | Estado | Texto |
| --- | --- | --- |
| operação `pending`/`received`/`awaiting_confirmation` | Aguardando a TV | "Enviado — na TV, aperte Atualizar" |
| `applied` (ou presente no snapshot) | Na TV / Aplicado na TV | "Na TV" (cartão) / "Aplicado na TV" (mensagem de confirmação) |
| `error`/`conflict`/`expired` | Erro | motivo curto (`conflict`: "A lista mudou na TV; confira e reenvie") + **Reenviar** |
| `cancelled` | — | sem selo (some do cartão) |
| exclusão em andamento (`source.delete` pendente) | Aguardando a TV | "Exclusão enviada — na TV, aperte Atualizar" |

- O selo do cartão de lista é derivado por `listStatus(source, configuration, operations, snapshot)` (módulo puro e testado): operação pendente > operação com problema > presente no snapshot ("Na TV") > salva sem snapshot ("Aguardando a TV").
- **Reenviar** só com selo "Erro"; **Cancelar envio** só com operação pendente; **Editar/Excluir** sempre (exceto lista em exclusão pendente: só o selo).

## 5. Ajustes (registro de itens)

`SETTINGS_ITEMS` (ordem fixa; cada item = botão que abre a sub-tela, com título e uma linha de descrição; `<ul aria-label="Ajustes">`):

| Item | Descrição (pt) | Sub-tela |
| --- | --- | --- |
| Chave TMDB *(entra na US4)* | Capas, elenco e detalhes nos seus filmes e séries. | `TmdbPage` |
| Backup | Veja e apague o backup dos seus favoritos e histórico. | `BackupPage` (`BackupCard` reaproveitado) |
| Código de recuperação | Sua senha de reserva para recuperar esta TV. | `RecoveryCodeCard` reaproveitado |
| Recuperar acesso | Use o código se a TV foi formatada ou o app reinstalado. | `RecoveryPage` (fluxo atual) |
| Ajuda | Perguntas frequentes. | `FaqPage` (conteúdo atualizado) |
| Sair | Encerra a sessão neste navegador. | ação direta (`api.logout`); **mantém** o ID lembrado |

O contrato exige apenas a **ordem relativa** de Backup → Código de recuperação → Recuperar acesso → Ajuda → Sair e que "Sair" esteja dentro de `ul[aria-label="Ajustes"]`; a chave TMDB, quando existir, vem antes de Backup.

## 6. Entrada (login)

- Mantém os rótulos `Endereço MAC da TV` / `Chave do dispositivo`, o botão `Conectar` e os limites/recusa uniforme existentes.
- Com ID lembrado (`readRememberedDevice`): campo do ID vem preenchido no formato do campo (`A0-8C-FD-19-0A-8C`, `formatDisplayIdInput`), foco inicial na **chave**; sem ID lembrado, foco no ID. Botão secundário **Usar outra TV** (só quando há ID lembrado) limpa o campo, chama `forgetDevice` e foca o ID.
- `rememberDevice` é chamado **só** depois de sessão obtida (manual ou QR/`takeEntry` com `kind: 'device'`); nunca antes da resposta, nunca com a chave.
- Chave: `type=password` com olho (como hoje), `autocomplete="off"`, `inputmode="numeric"`; nunca preenchida.

## 7. Licença (US3)

Um cartão: estado + validade, oferta (`R$ 35` / 12 meses / uma TV / sem renovação automática — valores **validados** contra `offer` como hoje: 3500, BRL, 12, 1, `manual`), e **uma frase ao lado do botão** que substitui a caixa de seleção e **inclui o ID da TV**: "A licença será ativada na TV {ID}." Botão grande **Comprar licença**/**Renovar licença** (`purchaseLabel`). Pedido pendente reaproveitado (sem nova cobrança); `checkoutEnabled=false` mostra o motivo e deixa o botão indisponível (não escondido). `safeCheckoutUrl` e a idempotência de tentativa (`attempt`) não mudam. O código de recuperação **sai** desta tela (vai para Ajustes).

## 8. Textos novos (chaves em `lib/i18n/areas/novoPortal.ts`, pt/en/es; só pt aqui)

`navMain` Principal · `navLists` Listas · `navLicense` Licença · `navSettings` Ajustes · `summaryTitle` Resumo da TV · `lastContact` Último contato · `noContactYet` Ainda sem contato · `staleContact` Sem contato recente: abra o app na TV e aperte Atualizar · `statusOnTv` Na TV · `statusWaitingTv` Aguardando a TV · `statusError` Erro · `sentNextStep` Enviado — na TV, aperte Atualizar · `appliedOnTv` Aplicado na TV · `listDelete` Excluir · `listDeleteConfirm` Sim, excluir · `cancelSend` Cancelar envio · `useAnotherTv` Usar outra TV · `licenseAcceptsTv` A licença será ativada na TV {id}. · `settingsTitle` Ajustes · `help` Ajuda · mais os do `TmdbPage` (US4) e as descrições da seção 5. Sai: `sellers*`, `comingSoon`, `reload`, `licenseConfirm`.
