# Implementation Plan: Fontes IPTV completas — estado, contagem e expiração da conta

**Slug**: `034-fontes-estado-expiracao` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/034-fontes-estado-expiracao/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A linha da fonte em Configurações e o cartão em "Quem está assistindo?" passam
a mostrar o vencimento da conta Xtream, "Sincronizando", "Credencial inválida"
e a contagem conhecida, e uma lista cuja conta o painel confirmou vencida ou
recusada deixa de abrir: aparece uma tela de acesso com o motivo, "Editar
lista", "Verificar de novo" e "Voltar".

Abordagem: o `exp_date` que o conector já lê passa a ser guardado na fonte
(três campos sem índice, sem subir o Dexie), gravado pela sincronização e por
uma consulta leve ao escolher a lista (no máximo a cada 24 h, com limite de
5 s). Regras puras em `lib/catalog/sourceAccount.ts`, consulta em
`lib/catalog/accountCheck.ts`, tela nova `features/sources/SourceAccessGate.tsx`
empilhada pelo `appNav` existente. A constitution foi emendada para 1.7.0 para
permitir o impedimento (decisão do usuário, ver R-001).

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, build `chrome108`).

**Primary Dependencies**: Dexie (IndexedDB), @tanstack/react-query, o
`useRemoteNav` do projeto (ADR-009), componentes V14 (`Button`, `Spinner`,
`Chip`).

**Storage**: IndexedDB via Dexie v12 — só campos novos sem índice em
`sources` (`data-model.md` §1). Nenhuma tabela, índice ou versão nova.

**Testing**: Vitest + Testing Library + fake-indexeddb (um `CatalogDb` por
teste, nome aleatório); Playwright (script `tv-web/e2e/*.mjs` com painel
Xtream falso servido por `http.createServer`, padrão de `e2e/metadata-tmdb.mjs`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, origem
`file://`); navegador desktop no desenvolvimento.

**Performance Goals**: escolher uma lista válida nunca espera mais que 5 s pela
verificação (SC-003); verificação feita no máximo uma vez a cada 24 h por
lista; nenhuma chamada por foco.

**Constraints**: client-first (ADR-008); credencial e URL nunca em tela, log,
`aria-*` ou erro (constitution, ADR-010); a importação roda num Worker
(`importRunner`), então o que o pipeline grava vai pelo Dexie, nunca por
memória da thread de UI; `resolveAccountStatus` é a única forma de falar com
a conta (reuso, não uma segunda implementação).

**Scale/Scope**: uma pessoa, poucas listas (1–5); a contagem lê só a tabela
`categories` da geração ativa.

## Decisões Invariantes

- **D-001** — A verdade da conta mora em `SourceRecord` (`accountStatus`,
  `accountExpiresAt`, `accountCheckedAt`); telas leem `SourceOut.account`,
  nunca consultam o painel sozinhas. Só `accountCheck.ts` (consulta leve) e
  `importPipeline.ts` (sincronização) escrevem.
- **D-002** — "Vencida" é `accountStatus === 'expired'` **ou** data guardada no
  passado; "ativa" com data passada é vencida (FR-004). Dias até o vencimento
  contam por calendário local, nunca por `ms / dia`.
- **D-003** — O impedimento só vale com confirmação do painel (resposta
  recente ou guardada). Falha de rede/tempo esgotado sem nada guardado
  **abre** a lista (constitution 1.7.0). Com dado guardado vencido/recusado,
  bloqueia mesmo offline (decisão do usuário, US2 AC6).
- **D-004** — A consulta leve só acontece ao escolher a lista (se a última
  verificação tem mais de 24 h), em "Verificar de novo" e dentro da
  sincronização. Nunca por foco, nunca em segundo plano, nunca em laço.
- **D-005** — O limite de 5 s é garantido por `Promise.race` com um temporizador,
  não só por `AbortSignal` (um `fetch` que ignora o sinal não pode prender a
  tela).
- **D-006** — Fonte fora de `providerImportMode: 'xtream_api'` (M3U avulsa,
  Modo limitado, nunca sincronizada) não mostra conta e nunca é impedida.
- **D-007** — Impedir a entrada não apaga nada: catálogo, favoritos,
  histórico, retomada e `connectionState` da fonte ficam como estão.
- **D-008** — A tela de acesso entra pela ação `open` existente do `appNav`
  (só um tipo novo de `AppScreen`); nenhuma ação nova no redutor, para não
  mexer nos contratos travados da 023/024.
- **D-009** — Contagem vem de `useCatalogCounts` (a regra de "nunca 0
  inventado" da 010 já está lá) + `lastUnavailableSections`; nunca uma chamada
  ao painel só para contar.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ❌ → ✅ após emenda | ✅ | A decisão "lista vencida não abre" violava a v1.6.1. O usuário decidiu emendar: v1.7.0 cria exceção para impedir **aquela lista** quando o painel confirmou vencimento/recusa, preservando interface, outras listas e estado local (R-001, D-003, D-007). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | `account` não tem segredo; a consulta usa `readCredential` só dentro de `accountCheck.ts`; resultado e logs sem URL (contrato C3 serializa o resultado e procura usuário/senha/host). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Contagem só lê as categorias da fonte. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem data → "Sem data de vencimento"; seção sem resposta → "não obtidos", nunca "0". |
| Comandos Locais Independem de Rede | ✅ | ✅ | A tela de acesso responde a ←/→/RETURN durante a consulta; RETURN nunca espera a rede. |
| Trailers e Metadados Não Alteram o Estado Principal | n/a | n/a | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Editar/Verificar/Voltar por ←/→/OK; RETURN volta. |
| Lista de Catálogo ≠ Manifesto | n/a | n/a | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | "Verificando…" tem `Voltar` focado; bloqueio foca "Editar lista" (C5). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN da tela de acesso volta aos perfis com `focusSourceId` da lista (D-008). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Nada chaveado por URL. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Contagem com a regra de cobertura da 010; "Sincronizando" só enquanto a execução existe. |
| Documentação É Canônica | ✅ | ✅ | `CLAUDE.md` e README atualizados no Polish; constitution já na 1.7.0. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/034-fontes-estado-expiracao/
├── spec.md
├── plan.md
├── data-model.md
├── logic/conta-da-fonte.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── App.tsx                                   # chooseSource → decisão de acesso; case 'source-access'
├── navigation/appNav.ts                      # AppScreen ganha 'source-access'
├── lib/catalog/
│   ├── db.ts                                 # SourceRecord: account*, lastUnavailableSections (feito no plan)
│   ├── sourceAccount.ts                      # NOVO — regras puras (stub)
│   ├── accountCheck.ts                       # NOVO — consulta leve com limite (stub)
│   ├── xtreamConnector.ts                    # AccountStatus.expiresAt; resolveAccountStatus({signal})
│   ├── importPipeline.ts                     # grava a conta no sucesso/falha
│   └── sourceRepository.ts                   # SourceView.account; markAccount; markSynced(account, unavailableSections)
├── features/
│   ├── import/importApi.ts                   # SourceOut.account/unavailable_sections; useSourceSyncing; useCheckSourceAccount
│   ├── sources/
│   │   ├── sourceFormat.ts                   # formatStatus(syncing), formatAccount, sourceAlertChips, formatCounts
│   │   └── SourceAccessGate.tsx              # NOVO — tela de acesso (stub)
│   ├── profiles/ProfilesScreen.tsx           # chips de problema + "Sincronizando" no cartão
│   └── settings/SourcesPanel.tsx             # linha: conta, contagem, "Sincronizando"
└── e2e/fontes-estado.mjs                     # NOVO — painel falso, cenários do quickstart
```

**Structure Decision**: frontend único (`tv-web/`), client-first; `api/` não é
tocado. Regras novas em `lib/catalog/` (sem React); tela em
`features/sources/` (onde já moram `sourceFormat.ts`,
`LimitedModeNotice.tsx` e `DeleteSourceModal.tsx`).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma — a violação de "Sem Conta Obrigatória" foi resolvida por emenda da constitution, não justificada aqui; ver R-001) | | |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivos>
npx tsc -b
npm run lint
npx vitest run
node e2e/fontes-estado.mjs      # com npm run dev rodando
npm run test:e2e
npm run build:tizen
```

Flakes conhecidos sob paralelismo (passam isolados; não são desta feature):
`SeriesScreen.favorites`, `MoviesScreen.favorites`, `LiveScreen.favorites`,
`LiveScreen.test`.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts`,
`tv-web/src/lib/catalog/accountCheck.fontes-estado.contract.test.ts`,
`tv-web/src/lib/catalog/importPipeline.fontes-estado.contract.test.ts`,
`tv-web/src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts src/lib/catalog/accountCheck.fontes-estado.contract.test.ts src/lib/catalog/importPipeline.fontes-estado.contract.test.ts src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `descreve os cinco casos de vencimento, "hoje", e credencial recusada` | US1 AC1–AC5; FR-003/004/005/016; SC-001 | Fase 2 | `Error: not implemented` |
| C2 `decide abrir, verificar ou impedir a lista…` | US2; FR-008/010/022; constitution 1.7.0 | Fase 2 | `Error: not implemented` |
| C3 `sem resposta do painel (rede ou demora) devolve o dado guardado…` | FR-009; SC-003; segredo | Fase 2 | `Error: not implemented` |
| C4 `sucesso grava vencimento e verificação; credencial recusada depois marca "refused"…` | FR-001/002/016; US3 AC3; D-007 | Fase 2 | `AssertionError: expected undefined to deeply equal { status: 'active', … }` |
| C5 `lista vencida mostra o motivo com a data, foca "Editar lista"…` | US2 AC1/AC2/AC5; FR-010–013; foco; segredo | Fase 4 | `Error: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/sourceAccount.ts`, `tv-web/src/lib/catalog/accountCheck.ts`,
`tv-web/src/features/sources/SourceAccessGate.tsx`; campos novos já declarados
em `db.ts` (`SourceRecord`), `sourceRepository.ts` (`SourceView.account`) e
`importApi.ts` (`SourceOut.account`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A decisão do usuário "lista vencida/recusada não abre" violava "Sem Conta Obrigatória" (v1.6.1: expiração não pode bloquear o estado local já sincronizado). | Sem resolver, a US2 inteira seria inconstitucional. | Resolvido: o usuário decidiu emendar (2026-09-30); constitution 1.7.0 com exceção estreita — só a lista confirmada vencida/recusada, com tela de motivo e caminho de correção, sem apagar estado local; falha de rede sozinha nunca impede (D-003, D-007). |
| R-002 | O formato real de `exp_date` no painel de referência (segundos Unix em string) só foi visto no conector e em fixtures; outro painel pode mandar ms ou data ISO. | Data errada na tela e bloqueio indevido. | `parseExpDate` aceita só número; não numérico = "sem data" (nunca bloqueia). SC-006 confere a data contra a lista real do `.env` (T030). |
| R-003 | Relógio da TV errado faz a comparação errar. | Bloqueio indevido ou aviso fora de hora. | A tela mostra a data para a pessoa conferir; "Verificar de novo" reconsulta. Fora do escopo corrigir relógio. |
| R-004 | Uma verificação > 24 h dispara uma requisição ao escolher a lista, com até 5 s de espera. | Abrir a lista fica mais lento uma vez por dia. | Limite de 5 s (D-005); a resposta atualiza `checkedAt`, então só a primeira escolha do dia paga. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

- (nenhum ainda)

## Cuidados para Retomada

- (nenhum ainda)
