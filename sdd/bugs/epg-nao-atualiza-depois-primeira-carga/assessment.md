# Bug Assessment: EPG não atualiza depois da primeira carga

- **Slug**: epg-nao-atualiza-depois-primeira-carga
- **Criado**: 2026-10-09
- **Origem**: texto colado ("revisar se epg esta sendo atualizado suspeito que so carrega uma vez e nao esta atualizando mais") + avaliação `sdd/assessments/epg-atualizacao-periodica/` (veredito go, como bug)
- **Veredito**: valid
- **Severidade**: high

## Report

Usuário, 2026-10-09: suspeita de que o EPG carrega uma vez e não atualiza
mais. Respostas na avaliação: o **guia fica vazio depois de um tempo**; o uso
é **fechar e reabrir o app** escolhendo a lista; o EPG vem do **painel
Xtream** (`xmltv.php`, endereço montado pelo app).

## Symptom

Observado: depois de alguns dias de uso normal, os canais ficam sem
programação ("Agora/A seguir" e guia vazios). Esperado: cada abertura da lista
com EPG vencido (> 12 h, FR-009 da feature 030) renova a programação.

## Reproduction

Pelo código (determinístico, sem TV):

1. Fonte Xtream com `lastSuccessfulSyncAt` há mais de 10 min e
   `epgLastSyncAt` há mais de 12 h.
2. Escolher a lista (ou voltar o app ao primeiro plano) → `useOpenSource`.
3. `decideOnOpen` devolve `update_by_age` → `startLocalImport` → retorna sem
   checar `isEpgStale`.
4. O EPG só é pedido quando a importação termina `completed`. Se o app é
   fechado antes disso (ou a importação falha/é cancelada), nenhum EPG é
   pedido; na próxima abertura o ciclo se repete.
5. Passadas ~48 h da última sincronização bem-sucedida, a janela guardada
   acaba e o guia esvazia.

Sonda do painel real (2026-10-09, credenciais `CCPLAY_PROBE_*`, valores não
registrados): `xmltv.php` responde **200, 15,2 MB, 1,6 s**, 1.013 canais,
41.475 programas, de 04/10 a 15/10 (fuso `-0300`). A fonte tem programação
futura, então guia vazio = sincronização que não aconteceu (ou falhou na TV),
não falta de dados no painel. Observação: com o User-Agent padrão do `curl`, o
painel responde **403** (tanto em `xmltv.php` quanto em `player_api.php`); com
User-Agent de TV, 200. Não afeta a TV, mas explica sondas futuras dando 403.

[NEEDS CLARIFICATION: estado do EPG na TV em Configurações › Fontes IPTV —
"vinculado" com data antiga (confirma este caminho) ou erro `EPG-02` (a
própria sincronização falha na TV)? Não bloqueia o fix: o caminho do código
está errado nos dois casos.]

## Suspected Code Paths

- `tv-web/src/features/import/importApi.ts:487-500` (`useOpenSource`) — o ramo
  `isEpgStale → requestEpgSync` só roda quando `decideOnOpen` dá `none`. Com
  `REFRESH_ON_OPEN_MIN_MS` = 10 min (bug `lista-xtream-nao-atualiza-novos-filmes`),
  quase toda abertura cai no ramo da importação e esse ramo vira código morto.
- `tv-web/src/features/import/importApi.ts:283-292` (`startLocalImport`) — único
  outro gatilho na abertura: `requestEpgSync` só quando `run.status === 'completed'`.
- `tv-web/src/lib/catalog/freshness.ts` (`decideOnOpen`,
  `REFRESH_ON_OPEN_MIN_MS`) — mudança de prazo que deixou o ramo do EPG
  inalcançável. Não muda no fix.
- `tv-web/src/lib/epg/epgSync.ts` (`BEFORE_HOURS`/`AFTER_HOURS` = 12/48) — por
  que o sintoma aparece como "guia vazio" ~48 h depois. Não muda no fix.
- `tv-web/src/features/import/useRefreshOnForeground.ts` — a volta ao primeiro
  plano passa pelo mesmo `useOpenSource`; o fix vale para ela também.

## Root Cause Hypothesis

A sincronização do EPG ao abrir a lista ficou **encadeada atrás de uma
importação concluída**. Quando o bug `lista-xtream-nao-atualiza-novos-filmes`
baixou o prazo de atualização ao abrir de 24 h para 10 min, o ramo que
renovava o EPG vencido sem importar (`decideOnOpen === 'none'`) deixou de ser
alcançado em uso real, e o EPG passou a depender só do `completed` da
importação. Qualquer importação que não termina — app fechado no meio, falha
de rede, conta recusada, Worker morto — pula o EPG, e nada compensa depois. O
teste `importApi.epg.test.tsx` só cobre "EPG vencido" com importação recente
(< 10 min), por isso não pegou. **Confiança: medium** — o defeito no código é
certo; que seja *esta* a causa do guia vazio na TV do usuário (e não uma
sincronização falhando na TV) ainda não foi confirmado no aparelho.

## Proposed Remediation

**Preferida**: em `useOpenSource`, checar `isEpgStale` **sempre**, antes de
decidir a importação, e pedir `requestEpgSync` em segundo plano quando
vencido — independentemente do ramo. O gatilho pós-importação continua (o
endereço declarado `url-tvg` pode ter mudado, D-008), mas só pede EPG se,
relida a fonte, o EPG ainda estiver vencido ou o endereço resolvido tiver
mudado durante a importação — para não baixar 15 MB duas vezes por abertura.
O single-flight do `epgRunner` já cobre a corrida "sync da abertura ainda em
voo quando a importação termina".

**Alternativas**:
- Disparar EPG também quando a importação termina `failed`/`cancelled` —
  não cobre "app fechado antes da importação terminar", que é o mais provável
  no uso "fecha e reabre".
- Aplicar a regra do EPG dentro de `decideOnOpen` (nova ação) — mistura duas
  decisões independentes e mexe em contrato da 004/030 sem ganho.

**Files likely to change**:
- `tv-web/src/features/import/importApi.ts`
- `tv-web/src/features/import/importApi.epg.test.tsx`

**Tests to add or update**:
- Novo: abrir com importação devida (`update_by_age`) **e** EPG vencido pede
  o EPG mesmo quando a importação termina `failed`, `cancelled` ou nunca termina.
- Novo: importação concluída com EPG já em dia (sincronizado na abertura)
  não pede uma segunda sincronização.
- Manter: "importação concluída sincroniza" (EPG vencido/nunca sincronizado),
  "EPG em dia/desativado/sem endereço não faz nada", "precisa migrar importa e
  só então sincroniza" (fonte sem ids de EPG — ver riscos).
- Ajustar: "importação falha ou cancelada não sincroniza" passa a valer só
  para EPG **em dia**.

## Risks & Considerations

- **Concorrência na TV**: EPG (15 MB, ~41 mil programas, Worker próprio) rodando
  junto da importação (Worker próprio) aumenta a carga simultânea de rede e
  IndexedDB no aparelho. Ambos já são Workers e a interface não espera nenhum
  dos dois; validar na TV que a abertura não fica pesada.
- **Migração (`epgIdsCapturedAt` ausente)**: sincronizar o EPG antes da
  importação de migração terminar é inofensivo (os programas são por fonte, o
  casamento com canal é na leitura), mas o teste "só então sincroniza" deve
  continuar passando.
- **Fonte de que o EPG está sempre falhando**: `isEpgStale` olha só
  `epgLastSyncAt` — com falha recorrente, cada abertura tenta de novo. É o
  comportamento desejado (FR-009), sem laço: só uma tentativa por abertura.
- Não mexer em `REFRESH_ON_OPEN_MIN_MS`, na janela 12/48 h nem no prazo de 12 h.

## Open Questions

- [NEEDS CLARIFICATION: estado do EPG na TV (vinculado com data antiga ×
  `EPG-02`)] — informa se o fix basta ou se há uma segunda causa (sincronização
  falhando no aparelho). Conferir na fase Test, na TV física.
