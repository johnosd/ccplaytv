# Bug Fix: "Sincronizar agora" do EPG fica "Sincronizando" sem terminar na lista real da TV

- **Slug**: sincronizar-agora-epg-fica-sincronizando-sem
- **Corrigido**: 2026-10-20
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O download do guia ganhou um vigia de parada (60 s sem receber nada → falha `network`, nunca mais "Sincronizando" eterno por rede parada), e o
Worker do EPG passou a reportar fases (`headers`, `room`, `read`, `written`) ao canal de métricas do build de medição. **Parcial**: a causa
real na TV segue desconhecida; as fases existem para achá-la, e o vigia só cobre o caso de download parado.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/epg/epgSync.ts` | modified | `stallMs` (padrão `EPG_STALL_MS` = 60 s) e `onPhase`; o sinal de aborto próprio substitui o repasse direto de `options.signal` (que continua cancelando); `Promise.race` na leitura do corpo, para não depender de o `fetch` propagar o aborto; `finally` limpa timer e listener |
| `tv-web/src/lib/epg/epgWorker.ts` | modified | mensagem `progress` (`phase`, `ms`) |
| `tv-web/src/lib/epg/epgRunner.ts` | modified | repassa `progress` ao canal (`emitMetric`), também no plano B da thread principal |
| `tv-web/src/lib/perf/metricsChannel.ts` | modified | rótulos `sent`, `start`, `config`, `headers`, `room`, `read`, `written` |
| `tv-web/src/features/import/importSections.ts` | modified | **a correção da causa real**: `guideRow` pronto com guia fresco (< 12 h); novo campo `now` |
| `tv-web/src/features/import/importApi.ts` | modified | reexporta `EPG_STALE_AFTER_MS` (as telas só falam com `importApi`) |

## Tests Added or Updated

- `importSections.test.ts` — guia sincronizado há < 12 h está pronto; vencido ou sincronizando segue carregando.
- `epgSync.extra.test.ts` — corpo que para de chegar vira `failed/network` sem gravar nada; servidor que nunca responde idem; cancelamento de quem
  chamou continua propagando `AbortError`; `onPhase` marca `headers → room → read → written` em ordem.

## Local Verification

- `npx vitest run src/lib/epg src/lib/perf` → 100 passed; `npx vitest run src/lib src/features/import src/features/settings` → 1939 passed.
- `npx tsc -b` limpo; `npm run lint` sem erros.
- Contratos da 085 (`metricsChannel.gravacao-carga-secao.contract.test.ts`) seguem verdes.
- Checagem manual: nenhuma (a causa só existe na TV).

## Causa raiz real (descoberta na TV, depois do assessment)

A foto da TV (2026-10-20) mostrou a **tela de progresso da importação** com Canais, Filmes e Séries "Pronto" e o passo **Guia "Carregando"**. Não
era a sincronização do guia travada: a importação só pede o guia se o dado estiver **vencido (12 h, `EPG_STALE_AFTER_MS`)** ou o endereço mudar
(`isEpgDueAfterImport`). Ressincronizando a lista de novo dentro de 12 h, **nenhum guia é pedido** (por isso nenhuma marca `sent` chegou ao coletor),
mas `guideRow` só aceitava "Pronto" quando `lastSyncAt >= runStartedAt` (sincronizado *nesta* importação) e caía no último caso: **"Carregando"
para sempre, sem nada rodando**. Bug de interface, no `guideRow` (`features/import/importSections.ts`).

**Correção**: `guideRow` passa a dar `ready` quando o EPG está `linked`, tem `lastSyncAt` e esse dado tem menos de 12 h (sem sincronização em andamento).
Teste novo em `importSections.test.ts` (fresco → pronto; sincronizando ou vencido → carregando; a linha resolve a tela).
O vigia de parada e as fases ficam como proteção (o Worker do EPG não tinha limite), mas **não eram a causa** do sintoma relatado.

## Deviations from Assessment

- **Sem teto de tempo total.** - **A hipótese do assessment estava errada**: o assessment apontava o Worker/download. A causa real é a linha "Guia" da tela de progresso (ver acima), descoberta quando a foto da TV mostrou a tela. O sintoma "Sincronizando" do botão em Ajustes → EPG nunca foi reproduzido (o botão só vale para EPG externo, segundo o usuário).
- **Sem teto de tempo total.** O assessment propunha ~2 min no Worker; o usuário informou que o guia "sempre demorou, mas deixa entrar na lista
  enquanto carrega em background", então um teto total poderia matar uma sincronização lenta que hoje termina. Ficou só o vigia de **parada**
  (60 s sem nenhum byte), que não corta um download lento, mas vivo.
- **Worker encerrado pela TV** (a outra hipótese do assessment) **não é detectado**: sem mensagem não há como distinguir de "ainda trabalhando".
  As fases mostram em que ponto o Worker parou de reportar.
