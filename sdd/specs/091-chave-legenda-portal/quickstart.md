# Quickstart — 091 chave de legenda pelo portal

Ordem: A (automático) → B (portal + TV no navegador, serviço simulado ou emulador) → C (TV física, gate G-2 de fechamento).
O gate G-1 (ADR-022 + constitution 1.17.0) é decisão normativa e não é validado aqui.

## Pré-requisitos

- G-1 cumprido (T001): sem ele nada que envie a chave ao serviço existe.
- `tv-web/`, `portal-web/`: `npm install`; `api/`: `uv sync --locked`.
- Emulador Firestore para os testes do serviço: Java 21 **só no processo** (ver `memory/java-21-emulador-firestore.md` e
  `docs/portal/operacao.md`): `gcloud emulators firestore start --host-port=127.0.0.1:8085 --database-mode=firestore-native
  --edition=standard --project=demo-ccplaytv-portal --quiet`, depois `PORTAL_TEST_FIRESTORE=1`.
- Chaves de **desenvolvimento** (`OPEN_SUBTITLES_API_KEY`, `SUBDL_SUBTITLES_API_KEY` no `.env`) só para a passada C na TV, nunca impressas.
  Os testes automáticos usam chaves fictícias e fornecedores simulados.

## A. Automático

```powershell
# Contratos travados e integridade da trava (091) + travas que esta mexe de perto
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 091-chave-legenda-portal
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 077-redesenho-portal-web
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 090-legendas-externas
cd tv-web; npx vitest run src/lib/portal src/features/settings src/lib/subtitles src/lib/i18n; npx tsc -b; npm run lint; npm run build
cd ..\portal-web; npx vitest run; npm run build
cd ..\api; $env:PORTAL_TEST_FIRESTORE=1; uv run pytest tests/portal; uv run ruff check .
# E2E (dev server da TV na 5173; portal-web na 5174 para o Playwright)
cd ..\tv-web; node e2e/run.mjs --only chave-legenda-portal,legendas-externas,legibilidade-tv,teste-conexao-tv
cd ..\portal-web; npm run test:e2e
```

## B. Portal e TV no navegador

Rode os E2E (portal simulado por `context.route`) ou, com a pilha local do portal (`e2e/lib/portalStack.mjs`):

| # | Passo | Esperado | Origem |
| --- | --- | --- | --- |
| B1 | Portal → Ajustes | Item "Chaves de legenda" logo depois de "Chave TMDB" | FR-001 |
| B2 | Abrir Chaves de legenda sem chave | Duas seções com "Não configurada", campo oculto (olho) e link de onde criar | US1/AC1 |
| B3 | Colar uma chave fora do formato | Recusada antes de enviar, sem eco; foco no campo | FR-002 |
| B4 | Colar uma chave boa do SubDL e enviar | Campo limpo; "Enviado — na TV, aperte Atualizar"; estado "Aguardando a TV"; a chave não está em URL, storage nem DOM | US1/AC2, SC-002 |
| B5 | TV: Configurações → Integrações → **Atualizar** do card TMDB | A seção Legendas mostra o SubDL "Sua chave — válida"; a TMDB (se havia) também aplicada | US1/AC3, AC5 |
| B6 | Portal: reler | "Aplicada na TV" (depois do ack e do snapshot) | US1/AC5 |
| B7 | Enviar duas chaves seguidas para o mesmo fornecedor | Só a última fica pendente; o outro fornecedor intacto | US2/AC1 |
| B8 | Chave recusada pelo fornecedor (simulado) | TV: nada troca, motivo na linha; portal: "Recusada pelo fornecedor" com Substituir | US1/AC6, SC-003 |
| B9 | TV sem rede no Atualizar | A operação continua pendente; portal "Aguardando a TV — tentando de novo"; depois funciona | US2/AC2 |
| B9b | Snapshot sem `integrations.subtitles` (TV antiga) | Portal: "Estado desconhecido" | US2/AC4, SC-005 |
| B10 | Portal: Remover → confirmar | "Remoção enviada — na TV, aperte Atualizar" | US3/AC1 |
| B11 | TV: Atualizar da seção **Legendas** | Só as de legenda; o fornecedor volta a "Padrão do ccplayTv"/"Sem chave"; portal "Não configurada" | US3/AC2, FR-005 |
| B12 | Inspecionar corpos e respostas | `PUT` leva a chave só no corpo; nenhuma resposta ao navegador a contém; ack da TV só tem fornecedor/id/estado/motivo | FR-007, SC-002 |
| B13 | Build base (sem `VITE_PORTAL_ORIGIN`) | Seção Legendas sem a linha "Atualizar" (nada de "em breve") | FR-011 |

## C. TV física (gate G-2 — fechamento) — pedir autorização antes de instalar (`tizen-tv`)

| # | Passo | Esperado |
| --- | --- | --- |
| C1 | Enviar a chave de teste do SubDL pelo portal e apertar **Atualizar** na TV (card TMDB) | Linha do SubDL "Sua chave — válida"; legenda buscável sem digitar nada |
| C2 | Repetir com o OpenSubtitles | Idem |
| C3 | Chave inválida pelo portal | TV mantém a anterior e mostra o motivo; portal "Recusada" |
| C4 | Remover pelo portal e Atualizar | Fornecedor volta ao padrão; chave some do aparelho |
| C5 | TV desligada/sem rede por um período, depois Atualizar | Operação ainda pendente e aplicada no Atualizar |

Registrar em `sdd/specs/091-chave-legenda-portal/evidencias/` (sem chave, sem host de fornecedor). Sem janela de TV, a feature
fica **não entregue** (T036), mesmo com todo o resto verde.

## Checklist cross-cutting (constitution)

- [ ] ADR-022 e constitution 1.17.0 gravadas com aprovação (G-1).
- [ ] Nenhuma chave de legenda em log, URL, `Referer`, storage, DOM depois do envio, resposta ao navegador, ack, snapshot, backup ou pacote.
- [ ] Revisão de segredos antes do commit (toca configuração/cifra do serviço).
- [ ] Todo estado da seção Legendas (com/sem portal, com/sem chave, durante o Atualizar) tem um elemento focável; RETURN fecha primeiro o diálogo, depois a aba.
- [ ] Textos novos nos três idiomas (portal e TV) e no `legibilidade-tv.mjs`.
- [ ] Nada novo no player, na navegação ou na montagem de tela (FR-014).
