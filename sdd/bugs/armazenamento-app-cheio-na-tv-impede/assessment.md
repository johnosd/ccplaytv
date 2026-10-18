# Bug Assessment: Armazenamento do app cheio na TV impede gravar a licença e desvincular

- **Slug**: armazenamento-app-cheio-na-tv-impede
- **Criado**: 2026-10-18
- **Origem**: texto colado (sessão da feature 081, T027; evidência em `sdd/specs/081-venda-producao-mercadopago/evidencias/tv.md` e `plan.md` R-014)
- **Veredito**: valid
- **Severidade**: high

## Report

Na TV física de referência (QN50Q60DAGXZD, 192.168.0.2), com 3 listas Xtream grandes:

- Compra real aprovada e concessão válida no serviço de produção; o portal mostra "Active license" até 17/10/2027.
- Na TV, **Portal & licença → Atualizar** responde `sync_error`. Com um pacote de diagnóstico, que mostra nome e mensagem
  da falha em `tv-web/src/lib/portal/portalAgent.ts`, o erro é **`AbortError` com `QuotaExceededError`** ao gravar a
  licença recebida.
- Na mesma TV, horas antes, **Desvincular** falhou 2× com `AbortError`, sem apagar nada. A 3ª tentativa, logo depois de
  reinstalar o app, funcionou.
- `CCPlayTv/config.xml` declara `http://tizen.org/privilege/unlimitedstorage` (HEAD e pacote).

## Symptom

Quando o IndexedDB do app atinge a cota, **qualquer** gravação falha. Isso inclui gravações pequenas e críticas: licença
paga, pareamento e desvincular. A pessoa paga e a TV continua em "Período de teste" com `sync_error`, sem dizer que é
falta de espaço. O esperado é que essas gravações nunca dependam de sobrar espaço depois do catálogo.

## Reproduction

1. TV com várias listas grandes usadas ao longo do tempo (a pré-carga da feature 038 preenche as categorias da lista
   ativa até a cota).
2. Comprar a licença (ou ter uma concessão válida no serviço).
3. Portal & licença → Atualizar → "Não foi possível atualizar. Código do erro: sync_error" (com o diagnóstico:
   `sync_error | AbortError: QuotaExceededError`).
4. Automatizado equivalente (a escrever na fase Fix): `storeLicense` com a tabela `licenseCache` lançando
   `QuotaExceededError` (mesma técnica de `seriesLoader.test.ts`, que simula quota).

[NEEDS CLARIFICATION: quanto a TV dá de cota com `unlimitedstorage` e quanto está usado — `navigator.storage.estimate()`
nunca foi medido no aparelho. Medir exige instalar um pacote na TV (perguntar ao usuário antes).]

## Suspected Code Paths

- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts:261,295`: a pré-carga só para **depois** de `storage_full`. Não
  reserva folga, então deixa o banco literalmente cheio.
- `tv-web/src/lib/catalog/prefetch/index.ts:36`: `runCategory` → `ensureCategory(..., { renew: true })` grava blocos
  da lista ativa; trocar de lista ao longo do uso acumula as três.
- `tv-web/src/lib/licensing/licenseRepository.ts:25-37` (`storeLicense`): grava em `licenseCache` sem tratar quota; o
  erro sobe como `EntitlementError`/Dexie.
- `tv-web/src/lib/portal/portalAgent.ts:207-211`: qualquer erro que não seja do portal vira `sync_error`, sem distinguir
  falta de espaço.
- `tv-web/src/lib/portal/unlink.ts:25-43` (`unlinkPortal`), `tv-web/src/lib/portal/deviceIdentity.ts`
  (`persistCredentialIssuance`): outras gravações críticas pequenas, sem tratamento de quota.
- `tv-web/src/lib/catalog/repository/shared.ts:32` (`isQuotaError`): a detecção já existe e reconhece o `inner` do Dexie.
- Caches recuperáveis (podem ser refeitos pela rede ou pelo arquivo): `categoryBlocks`/`catalogReadManifests` de listas
  **não ativas**, `sectionStaging`, `storedEntries` de gerações antigas, `epgPrograms`, `discoveryCache`,
  `titleMetadata`/`tmdbPeople`. Estado da pessoa (`userStates`, `categoryPreferences`, `parentalPin`, `sources`,
  `portalDevice`, `licenseCache`, `localTrial`) **nunca** pode ser apagado.

## Root Cause Hypothesis

Confiança **alta** no mecanismo, **média** no tamanho:
- A pré-carga do catálogo (038) enche o IndexedDB até a cota e só então para.
- Daí em diante, qualquer transação que grave algo (até um registro de poucos KB) é abortada pelo navegador com
  `QuotaExceededError`, e o Dexie a reporta como `AbortError` com `inner`.
- Licença, pareamento e desvincular não têm recuperação nem mensagem própria.
- `unlimitedstorage` não impediu o estouro: ou o Chromium do Tizen ainda aplica uma cota, ou o catálogo cresce até o
  limite real do disco reservado ao app. Isso só se confirma medindo no aparelho.

## Proposed Remediation

**Preferida** (duas camadas, sem mudar o modelo de dados):

1. **Folga na pré-carga**: antes de cada categoria, `navigator.storage.estimate()`. Se `usage` estiver acima de
   `quota − folga` (folga = máx(64 MB, 10 % da cota); valor a calibrar com a medição), a pré-carga para com
   `stoppedReason: 'storage_full'` **antes** de encher. Sem `estimate` disponível, mantém o comportamento atual.
2. **Gravações críticas resistentes à quota**: um helper `withStorageRelief(write)` em `tv-web/src/lib/catalog/` (via
   `catalogRepository`, nunca Dexie direto pelas telas). Ao receber erro de quota, libera caches recuperáveis numa ordem
   fixa e repete a gravação uma vez:
   1. `sectionStaging`;
   2. `discoveryCache`;
   3. blocos e manifestos de categorias das listas **não ativas**;
   4. `epgPrograms` das listas não ativas.

   Aplicar em `storeLicense`, `checkpointLicenseClock`, `unlinkPortal` e `persistCredentialIssuance`. Categoria liberada
   volta a ser obtida ao entrar nela (cobertura parcial é o estado normal desde a 010, ADR-002 emenda).
3. **Mensagem honesta**: o Atualizar distingue falta de espaço (`storage_full`) de `sync_error`, com o texto já existente
   de limite de armazenamento do app (STO-01, em pt/en/es) em vez do código genérico.
4. **Medição (com permissão do usuário)**: mostrar `usage`/`quota` em Configurações → Sobre & créditos (ou no
   diagnóstico da feature 062), para calibrar a folga e para suporte.

**Alternativas**:
- Só liberar cache quando a gravação crítica falhar (sem folga na pré-carga). É mais simples, mas o catálogo continua
  batendo no teto, e outras gravações (favoritos, progresso) seguem falhando.
- Pré-carga só na vizinhança (`PREFETCH_SCOPE = 'neighborhood'`, recuo previsto na 038/FR-014). Reduz o volume, mas
  não garante folga e muda a experiência validada.
- Gestão de armazenamento com tela de "liberar espaço por lista" é decisão de design: viraria feature própria
  (`sdd-specify`), não este bugfix.

**Files likely to change**:
- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts` e/ou `prefetch/index.ts` (checagem de folga)
- `tv-web/src/lib/catalog/storageRelief.ts` (novo: estimativa + liberação ordenada + `withStorageRelief`)
- `tv-web/src/lib/catalog/catalogRepository.ts` (exportar a liberação)
- `tv-web/src/lib/licensing/licenseRepository.ts`, `tv-web/src/lib/portal/unlink.ts`,
  `tv-web/src/lib/portal/deviceIdentity.ts` (envolver as gravações críticas)
- `tv-web/src/lib/portal/portalAgent.ts` (código `storage_full`; reverter o diagnóstico temporário da 081)
- `tv-web/src/features/settings/*` e `tv-web/src/lib/i18n/messages/*` (mensagem e, se aprovado, uso/cota)

**Tests to add or update**:
- `storeLicense`/`unlinkPortal` com a primeira gravação lançando `QuotaExceededError`: a liberação roda (cache de
  lista não ativa sai) e a 2ª tentativa grava. Estado da pessoa e a lista ativa intactos.
- Liberação nunca toca `userStates`, `categoryPreferences`, `parentalPin`, `sources`, `portalDevice`, `licenseCache`,
  `localTrial`, nem os blocos da lista ativa.
- Pré-carga para antes da cota quando `estimate` informa uso acima de `quota − folga` (fábrica `createPrefetchScheduler`
  com dependência injetada).
- Agente devolve `storage_full` (e não `sync_error`) para erro de quota.

## Risks & Considerations

- Constitution "Progresso e capacidades são reais": categoria liberada precisa voltar a aparecer como cobertura parcial
  (sem fingir catálogo completo). Os leitores existentes já tratam bloco ausente; confirmar na fase Fix.
- Leitores agregados não podem passar a ler `db.channels`/Dexie direto (CLAUDE.md): a liberação passa pelo
  repositório.
- `navigator.storage.estimate` no Tizen 9 pode reportar valores sem relação com o limite real. Por isso a folga é uma
  defesa e a liberação na falha é a garantia.
- Contratos travados de outras features que tocam a pré-carga (`prefetchScheduler.*.contract.test.ts`, 038/042/051)
  precisam continuar verdes.
- Medir na TV exige instalar um pacote: perguntar ao usuário antes (regra dele).

## Open Questions

- Respondido (usuário, 2026-10-18): folga provisória máx(64 MB, 10 % da cota) e **medir na TV** antes de fechar (instalação só com permissão); ajustar se a medição pedir.
- Respondido (usuário, 2026-10-18): mostrar uso/cota em **Sobre & créditos**, só leitura, sem botão de limpar.

## Atualização (Assess, 2026-10-18 — evidência da fase Test)

- **Medido na TV** (Sobre & créditos, pacote do fix): **"82,1 MB de 80 MB"**. A cota do app na TV é ~80 MB, não GB; o
  `unlimitedstorage` não tem efeito (a documentação do Tizen o restringe a apps de celular/relógio: [web runtime](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/tutorials/web-runtime.md)).
- Com o fix aplicado, o Atualizar mostrou o limite de armazenamento: liberar só o cache das listas **não ativas** não
  bastou. Hipóteses: a lista ativa + programação ocupam quase tudo; e/ou o IndexedDB do Chromium só devolve espaço após
  compactação (não verificado).
- **Premissa corrigida**: folga mínima de 64 MB é maior que a cota inteira → cai para 8 MB (com 10 % da cota).
- **Decisão do usuário (2026-10-18)**: emergência neste bugfix — gravação crítica pode, como último recurso, liberar a
  programação (EPG, marcada como não sincronizada, configuração preservada) e o cache de categorias da lista **ativa**
  (volta ao entrar); e abrir **feature própria** (sdd-specify + ADR) para o orçamento de armazenamento de ~80 MB antes
  da publicação na loja. Veredito e severidade mantidos (`valid`, `high`).
