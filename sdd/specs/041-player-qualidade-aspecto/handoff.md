# Handoff — 041-player-qualidade-aspecto

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. App da TV em `tv-web/` (React 19 + TS + Vite, alvo `chrome108`; Dexie; foco por estado via `useRemoteNav`, ADR-009).
- Próximo comando: `/sdd-execute 041-player-qualidade-aspecto`.
- Backlog: `Planejada`, 0/53.
- Mudado em disco por esta sessão fora da pasta da feature: o 1º teste de `tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx` (emenda aprovada) + trava da 027 regravada + `R-012` em `sdd/specs/027-player-chrome-ds-v14/plan.md`; tipos novos em `tv-web/src/lib/player/PlayerService.ts` e `tv-web/src/components/player/playerLayerTypes.ts`. Nada disso está commitado (nem a spec/plan da 041, nem a linha 55b do backlog).

## O que a feature entrega

- **US1 (P1)** Aspecto real no player (filme, episódio, canal): Ajustar/Preencher/Original/Zoom, **só os modos que o motor aplica**; a escolha segue a sequência (zapping, CH±, ↑/↓, próximo episódio, autoplay) e **não** muda a preferência.
- **US2 (P2)** Qualidade real: "Auto" + **só** as resoluções que o stream anuncia; uma só → "Qualidade — só uma disponível", soft disabled, OK só explica.
- **US3 (P2)** Aba real "Player & reprodução" (3ª aba, sem precisar de lista ativa): aspecto padrão, qualidade padrão Auto/Máxima/Econômica, idioma do áudio, legenda — **do aparelho**, não da lista. Toda reprodução nova parte delas; idioma ausente → padrão do stream, **sem aviso**.
- **US4 (P3)** "Velocidade" **sai de vez** (decisão do usuário): nem controle, nem mock "Em breve", nem id `speed`.
- Passada na TV física é **gate obrigatório**.

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001…016, SC-001…005, clarificações do usuário.
2. `plan.md` — D-001…D-010 (invariantes), R-001…R-008, Estratégia de Testes (contratos e vermelhos esperados).
3. `tasks.md` — Fase 1 é um **spike na TV**; Fase 7 é o gate.
4. `logic/aspecto-qualidade.md` — o "como": sessão, regras de escolha, disponibilidade, painéis, aba, textos exatos das mensagens.
5. `research.md` — o que do AVPlay é candidato e o que o spike precisa confirmar.
6. `data-model.md` — preferências em `localStorage` e as duas escolhas da sequência.
7. `quickstart.md` — cenários de navegador e os 7 da TV.
8. `.planning/memory/constitution.md` e `sdd/specs/040-dividir-player-live/logic/divisao.md` §1 (regras do `PlayerLayer` dividido).

## Testes de contrato

- `tv-web/src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx` — 4 testes (C1, C2 → Fase 3; C3, C4 → Fase 4).
- `tv-web/src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx` — 1 teste (C5 → Fase 5).
- Rodar (de `tv-web/`): `npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 041-player-qualidade-aspecto`
- **Travas de outras features em jogo**: 027 (`PlayerLayer.player-chrome.contract.test.tsx`, 1º teste emendado e **vermelho até a Fase 3**), 029 (`PlayerLayer.audio-legendas-info.contract.test.tsx` — **não** tocar; o comentário da linha 315 ainda cita "Velocidade", mas os 6 passos chegam em "Info do stream" pelo clamp), 026/028 (Configurações, acessibilidade). Rodar `check-contract-tests.ps1` de todas no fim de cada fase.

## Stubs criados

- `tv-web/src/lib/player/viewChoice.ts` — tipos/constantes **reais** (`AspectMode`, `ASPECT_MODES`, `ASPECT_LABEL`, `QualityOption`, `QualityPreference`, `QUALITY_PREFERENCE_LABEL`, `QualityChoice`, `ViewChoice`, `DEFAULT_VIEW_CHOICE`); funções `distinctQualities`/`qualityLabel`/`pickQualityForChoice`/`pickAspectForChoice` lançam `not implemented` (T004).
- `tv-web/src/lib/player/playerPreferences.ts` — chave, tipo e padrões reais; as 4 funções lançam `not implemented` (T005).
- `tv-web/src/lib/player/PlayerService.ts` — só os 4 métodos **opcionais** no `PlayerAdapter` (tipos) e o reexport dos tipos novos; a sessão ainda não tem nada (T007).
- `tv-web/src/components/player/playerLayerTypes.ts` — props `initialViewChoice`/`onViewChoiceChange` declaradas, **ainda não lidas** (T018 liga; tirar a frase "STUB do sdd-plan" do comentário).

## Armadilhas já mapeadas

- **Sem TV, não implementar o adaptador AVPlay por suposição** (T022/T029): parar e perguntar. As tasks não-AVPlay podem andar antes.
- `TrackChoice` **não pode mudar de forma** (contrato da 029 o importa) — por isso `ViewChoice` é separada (D-003).
- O player **nunca** chama `writePlayerPreferences` (C2 e C3 verificam).
- Qualidade: resultado `null` da regra **não chama** `selectQuality` (C3 espera exatamente `['v1']` ao começar). Aspecto: aplicar **sempre** na primeira entrada em `playing`, inclusive `fit`.
- Disponibilidade da qualidade vem de um ref atualizado em pontos discretos (reaplicação, SELECT, releitura) — nunca ler o motor a cada render.
- Painéis do player **não** são `Modal` (o `PlayerLayer` captura o teclado); o seletor da aba de Configurações **é** `Modal`.
- Contrato C2 usa `localStorage` real do jsdom e limpa no `beforeEach`/`afterEach`; testes novos que gravam preferências devem limpar também, ou o 029 ("montagem nova sem escolha não herda nada") pode ficar instável.
- Live: a 1ª → revela a linha com foco em "Guia"; a ordem é Guia Áudio Qualidade Aspecto Info.
- Toast com texto repetido precisa reanunciar (`messageKey`, ad-hoc da 040) — os avisos de soft disabled podem ser repetidos seguidos.
- Linhas das Configurações precisam de `no-scale` (foco cortado, ad-hoc anterior) e só um `.tv-focus` com o seletor aberto.
- Testes/E2E não travados que vão ficar vermelhos por mudança intencional estão listados em R-005 — ajustar só o que a FR mudou.
- E2E: rodar com `npm run dev` recém-iniciado; se o `test:e2e` encadeado falhar por `ERR_CONNECTION_REFUSED`, rodar os scripts um a um. Flakes conhecidos de unidade: `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo — registrar como pendência, nunca "ok".
- PowerShell 5.1: `.ps1` com acento precisa de UTF-8 com BOM; mensagens de commit por arquivo (`git commit -F <arquivo>`), não here-string.

## Pendências do Analyze

- A-01 (MEDIUM) — a spec (Assumptions) diz que o contrato da **029** também precisaria de emenda; não precisou (o clamp mantém o teste verde). Recomendação: corrigir a frase da spec no Polish (T043).
- A-02 (MEDIUM) — US2/AC2 ("Info do stream mostra a nova resolução") não tem verificação automática nominal. Recomendação: cobrir em `e2e/qualidade-aspecto.mjs` com o `webapis.avplay` falso (T038) além da TV.
- A-03 (LOW) — edge cases "tela de erro sem aspecto/qualidade" e "painéis não abrem sob guia/zapping" ficam cobertos só pela prioridade de teclado existente. Recomendação: um caso em `PlayerLayer.aspect.test.tsx` (T025).

## Gate de pronto

- 5/5 contratos da 041 + 5/5 da 027 + 5/5 da 029 verdes na suíte completa; todas as travas íntegras.
- `npx tsc -b --noEmit`, `npm run lint`, `npm run test`, `npm run build:tizen`.
- `npm run test:e2e` verde, incluindo o novo `e2e/qualidade-aspecto.mjs`.
- `quickstart.md` (navegador) executado.
- Docs no Polish: `CLAUDE.md`, `.planning/backlog.md` (55b), nota na 029.
- **Passada na TV física: gate obrigatório** (Fase 7, SC-002/SC-005), depois do E2E verde.
