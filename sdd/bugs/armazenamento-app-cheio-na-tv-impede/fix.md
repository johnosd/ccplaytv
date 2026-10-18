# Bug Fix: Armazenamento do app cheio na TV impede gravar a licença e desvincular

- **Slug**: armazenamento-app-cheio-na-tv-impede
- **Corrigido**: 2026-10-18
- **Assessment**: ./assessment.md
- **Status**: applied (falta a medição e a confirmação na TV, na fase Test)

## Summary

A pré-carga agora para **antes** de encher o IndexedDB, guardando uma folga de máx(64 MB, 10 % da cota). As gravações
críticas pequenas (licença, relógio da licença, cadastro, credenciais e desvincular) passam por `withStorageRelief`:
ao bater na cota, liberam cache refazível e repetem uma vez. A ordem da liberação é:
1. preparo de seções de outras listas;
2. cache de descobertas;
3. itens de categorias sob demanda das listas **não ativas**.

O Atualizar mostra o limite de armazenamento do app em vez de `sync_error`, e Sobre & créditos mostra uso/cota.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/catalog/storageRelief.ts` | added | `readStorageEstimate`, `storageHeadroom`, `hasStorageHeadroom`, `protectCatalogSource`, `releaseCatalogSpace`, `withStorageRelief`. Nunca toca estado da pessoa, listas, pareamento, licença, `storedEntries`, categorias `eager` nem a lista ativa |
| `tv-web/src/lib/catalog/prefetch/index.ts` | modified | `runCategory` devolve `storage_full` quando não há folga, e o agendador para como já fazia com quota |
| `tv-web/src/features/catalog/prefetchApi.ts` | modified | registra a lista ativa como protegida (`protectCatalogSource`) |
| `tv-web/src/lib/licensing/licenseRepository.ts` | modified | `storeLicense` e `checkpointLicenseClock` com `withStorageRelief` |
| `tv-web/src/lib/portal/deviceIdentity.ts` | modified | `enrollmentNonce` e `persistCredentialIssuance` com `withStorageRelief` |
| `tv-web/src/lib/portal/unlink.ts` | modified | `unlinkPortal` com `withStorageRelief` |
| `tv-web/src/lib/portal/portalAgent.ts` | modified | erro de quota/`StorageFullError` → código `storage_full`; **revertido** o diagnóstico temporário da 081 (`sync_error \| …`) |
| `tv-web/src/lib/portal/useRefreshAction.ts` | modified | status `storage_full` → `error.STO-01.description` ("O app atingiu o espaço disponível…"), sem código genérico |
| `tv-web/src/features/settings/AboutPanel.tsx`, `tv-web/src/styles/settings.css` | modified | linha "Armazenamento do app: X de Y" (só leitura; "a TV não informa o uso" sem estimativa) |
| `tv-web/src/lib/i18n/messages/listSettings.ts` | modified | `settings.about.storage`/`storageUnknown` pt/en/es (em `listSettings.ts` porque `settings.ts` está no teto da catraca) |

## Tests Added or Updated

- `tv-web/src/lib/catalog/storageRelief.test.ts`:
  - **liberação**: libera só o cache refazível das listas não ativas; a lista ativa, as categorias `eager`, os favoritos e
    as listas ficam, e a 2ª rodada não inventa espaço;
  - **nova tentativa**: a gravação crítica repete depois de liberar; sem nada a liberar dá `StorageFullError`; outro
    erro não é repetido;
  - **licença**: a licença assinada é gravada mesmo com a 1ª transação estourando a cota;
  - **folga**: o cálculo da folga e a parada antes de encher; sem estimativa, não bloqueia.
- `tv-web/src/lib/portal/portalAgent.test.ts`: Atualizar da licença sem espaço → `storage_full`; outro erro local
  continua `sync_error`.
- `tv-web/src/features/settings/PortalLicensePanel.test.tsx`: texto de compra indisponível atualizado (mudança da 081,
  não deste bug).

## Local Verification

- `npx vitest run src/lib/catalog/storageRelief.test.ts` → 4/4; `src/lib/portal/portalAgent.test.ts` → 11/11.
- `npm run test` (tv-web) → **645 arquivos, 3559 testes, todos verdes**.
- `npx tsc -b` limpo; `npm run lint` → `architecture: ok`.
- Contratos travados intactos: `catalogRepository.codigo-saudavel.contract.test.ts` (063), `repository/fachada.test.ts`,
  `prefetchScheduler.*.contract.test.ts`, 081 (`check-contract-tests.ps1` íntegro).
- **Não verificado na TV** ainda: medição de uso/cota e licença chegando no Atualizar (fase Test, instalação só com
  permissão do usuário).

## Deviations from Assessment

- A liberação **não** apaga `epgPrograms` das listas não ativas, item 4 da ordem proposta. Sem marcar a programação
  como "a sincronizar", o guia ficaria vazio sem aviso, o que fere o princípio "Progresso e capacidades são reais". Os
  três primeiros níveis bastam para gravações de poucos KB.
- `invalidateSourceReadModels` é importado de `lib/catalog/readProjection.ts`, e não pela fachada `catalogRepository`:
  o contrato travado da 063 exige que a fachada exporte exatamente a mesma lista de valores.

## Follow-ups

- Medir `usage`/`quota` na TV (Sobre & créditos) e calibrar `STORAGE_HEADROOM_*` se preciso.
- Feature futura, se o volume continuar alto: gestão de armazenamento por lista ("liberar espaço desta lista") e
  limpeza de EPG com marcação de ressincronização.

## Ajuste após a 1ª verificação na TV (2026-10-18)

Medição: **82,1 MB de 80 MB**. A liberação só de listas não ativas não bastou (adendo no assessment).

- `STORAGE_HEADROOM_MIN_BYTES`: 64 MB → **8 MB** (com 80 MB de cota, a folga é 8 MB: a pré-carga para em ~72 MB).
- `releaseEmergencySpace` (novo): último recurso das gravações críticas, decisão do usuário.
  - Apaga a programação de todas as listas com `deleteEpgForSource` e zera `epgLastSyncAt`. A configuração e a URL do
    EPG ficam, e o guia passa a "ainda não sincronizado".
  - Apaga o cache de categorias sob demanda da lista **ativa**, que volta ao entrar.
- `withStorageRelief`: tentativa → nível normal → tentativa → emergência → tentativa → `StorageFullError`.
- Teste novo em `storageRelief.test.ts`: a emergência só roda depois do nível normal falhar (a ativa ainda tem itens na
  2ª tentativa), e o estado da pessoa e as categorias `eager` ficam.
- Verificação: `npx vitest run src/lib/catalog src/lib/epg src/lib/portal src/lib/licensing src/features/settings` →
  188 arquivos, 977 testes verdes; `tsc` limpo; `architecture: ok`.
- Risco não verificado: o IndexedDB do Chromium pode só devolver o espaço apagado depois de compactar. Se a TV continuar
  recusando logo após a liberação, o próximo passo é a feature de orçamento de armazenamento, não este bugfix.
# Absorvido pela feature 082

O orçamento, a reserva e a liberação ordenada do catálogo foram absorvidos pela feature 082 (`sdd/specs/082-orcamento-armazenamento-tv`).
O bugfix continua como histórico da causa original; a implementação vigente está na feature 082.
