# Quickstart — verificação manual

## Pré-requisitos

- `cd tv-web; npm install` já rodado.
- Nenhum backend necessário — esta feature é inteiramente client-first
  (ADR-008). Não suba `api/` nem PostgreSQL.
- Para os cenários de TV: procedimento da skill `tizen-tv`, com a TV em
  Developer Mode, o IP do PC atualizado nela e o perfil de assinatura
  Samsung completo (author + distributor).
- Uma fonte de provedor real cadastrada. **As credenciais são digitadas
  pela pessoa no aparelho** — não passam por prompt, log, commit nem
  relatório.

## Checagens automatizadas

```powershell
cd tv-web
npm run test
npm run lint
npm run build
```

As três precisam passar antes de qualquer cenário manual. Nenhuma task é
concluída com elas vermelhas (constitution, "Fluxo de Desenvolvimento").

## Cenário A — Sincronizar termina rápido (US1, SC-001)

1. Na Home, focar o card da fonte de provedor e pressionar ▼.
2. Confirmar que a linha de ações abre em `Ressincronizar`.
3. Pressionar OK e **cronometrar** até o estado "Concluída".
4. Conferir na tela de progresso: a contagem é de **categorias**, e não
   aparece percentual em lugar nenhum.

**Aprovado se**: concluiu em ≤ 15 s e nenhum percentual apareceu.

## Cenário B — Entrar numa categoria traz o conteúdo (US2, SC-002)

1. Abrir a lista → Live TV.
2. Entrar numa categoria nunca visitada. Cronometrar até os itens
   aparecerem.
3. Durante o carregamento, pressionar ▲/▼: **algum elemento tem foco
   visível** e o controle responde.
4. Sair e entrar de novo na mesma categoria.
5. Repetir em Filmes e em Séries.

**Aprovado se**: primeira entrada ≤ 3 s; segunda entrada é imediata; em
nenhum momento houve tela sem elemento focável.

## Cenário C — O disco serve quando a rede não serve (US2, FR-007)

1. Visitar uma categoria (ela fica gravada).
2. Desligar a rede da TV.
3. Entrar de novo na categoria visitada → os itens continuam aparecendo.
4. Entrar numa categoria **nunca** visitada → estado de erro com ação de
   tentar de novo, e a categoria **continua na lista**.
5. Religar a rede, usar "Tentar de novo" na mesma categoria.

**Aprovado se**: o passo 3 funcionou offline, o passo 4 não removeu a
categoria nem prendeu o controle, e o passo 5 recuperou.

## Cenário D — Foco ao voltar (R-004, constitution)

1. Numa categoria, descer até um item bem abaixo do início.
2. Abrir o item (detalhe ou player) e voltar.
3. Deixar a categoria vencer (ou forçar revalidação) e voltar a ela.

**Aprovado se**: o item que originou a navegação recupera o foco, e depois
da revalidação o foco está no **mesmo item** — não no índice antigo
apontando para outro título.

## Cenário E — Números honestos (US3, SC-006)

1. No hub da lista, anotar as contagens de Filmes e Séries.
2. Entrar em Filmes e comparar com o que está disponível.
3. Procurar uma categoria cuja contagem declarada difira do entregue.

**Aprovado se**: a contagem do hub é identificável como declarada pelo
provedor, não como itens gravados; e a divergência do passo 3 aparece
declarada em vez de escondida.

## Cenário F — Ressincronizar descarta o baixado (FR-010)

1. Visitar três categorias.
2. Ressincronizar a fonte.
3. Entrar numa das três de novo.

**Aprovado se**: os itens são buscados de novo (comportamento decidido em
23/09/2026), **e** favoritos e posição de retomada dos itens continuam
lá — `userStates` não pode ter sido tocado (D-002).

## Cenário G — Fonte por URL M3U inalterada (FR-011)

1. Cadastrar ou ressincronizar uma fonte por URL M3U.

**Aprovado se**: comportamento idêntico ao de hoje — importação integral em
fluxo, tela de progresso contando entradas.

## Itens cross-cutting antes de considerar pronta

- [ ] `npm run test`, `npm run lint` e `npm run build` passando.
- [ ] Nenhuma credencial ou URL de painel em log, mensagem de erro, card
      ou `categories`/`channels` (revisão de vazamento antes de integrar).
- [ ] Todo estado novo — carregando, erro, vazio — com elemento focável,
      verificado **só com o controle remoto**.
- [ ] Nenhum percentual inventado em nenhuma tela.
- [ ] `contracts/local-storage.md` e `data-model.md` da feature 005
      atualizados, e ADR-002 emendada.
- [ ] Nada em `api/` modificado.

## O que este quickstart não prova

Desempenho, codec, DRM e reprodução **só** valem observados na TV física.
A TV não entrega console (sem `dlog`, sem `ps`, Web Inspector fechado,
confirmado em 23/09/2026), então cenário não observado por uma pessoa
olhando a tela é "não executado" — nunca "aprovado".
