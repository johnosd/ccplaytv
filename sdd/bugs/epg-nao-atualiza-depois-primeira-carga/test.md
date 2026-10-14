# Bug Verification: EPG não atualiza depois da primeira carga

- **Slug**: epg-nao-atualiza-depois-primeira-carga
- **Testado**: 2026-10-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: failed

## Summary

O sintoma original continua aparecendo na TV física com o fix instalado: o
guia e o "Agora" seguem vazios. A evidência nova responde à pergunta aberta
do assessment, e não do jeito que o fix supunha: em Configurações › Fontes
IPTV o EPG aparece **"vinculado", com data de sincronização recente**, sem
erro. Ou seja, a sincronização roda e é registrada como sucesso, mas a
programação não chega à tela. Existe uma segunda causa, do lado da gravação
ou da leitura, que este fix não cobre.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | TV física com o build de 2026-10-10 instalado (o `.wgt` de 15:51 já tem o commit `c76c125`): abrir a lista, ver Live TV e o guia | **fail** | Quem viu foi o usuário, na TV: "Guia/Agora vazios", sem mensagem de erro. |
| Estado do EPG na TV | Configurações › Fontes IPTV, observado pelo usuário | "vinculado, data recente" | Responde ao `[NEEDS CLARIFICATION]` do assessment: não é `EPG-02` nem data antiga. A data recente sugere que o gatilho corrigido dispara, mas não prova que a data avançou por causa do fix. |
| Testes novos/atualizados | `npx vitest run src/features/import/importApi.epg.test.tsx src/lib/epg/` | pass | 14 arquivos, 78/78. |
| Suite de regressão | — | not-run | Desnecessária pro veredito: o sintoma ainda reproduz. |
| Lint / type-check | — | not-run | Mesmo motivo. |

## Output Excerpts

```
 Test Files  14 passed (14)
      Tests  78 passed (78)
```

## Residual Risks

- O fix (pedir o EPG vencido em toda abertura) continua correto pelo código e
  pelos testes. Mesmo assim, guia vazio com EPG "vinculado, recente" quer dizer
  que um sucesso registrado não garante programação visível.
- Candidatos à segunda causa, só pelo código (nada disto foi verificado):
  1. **Sucesso com 0 programas**: `syncEpg` chama `recordEpgSuccess` mesmo
     quando `writeEpgPrograms` devolve `programCount: 0`, por exemplo quando
     nenhum programa cai na janela de -12 h/+48 h, o fuso é lido errado ou o
     parser não reconhece nada. O estado fica "vinculado, recente" e o guia
     fica vazio.
  2. **Ids que não casam**: `nowNextForChannel`/`guideRows` comparam
     `epg_channel_id` (lido de `categoryBlocks` desde a 039, ou da projeção)
     com o `channelKey` do XMLTV por igualdade exata. Se os blocos ou uma
     renovação 038/039 perderem `epgChannelId`, a leitura não acha nada.
  3. **Geração ativa**: `epgActiveGeneration` ausente ou divergente depois da
     escrita faz `listProgramsForChannels` devolver vazio.
- A TV não tem console (skill `tizen-tv`). Pra diagnosticar, é preciso
  reproduzir em `npm run dev` com a fonte real (`CCPLAY_PROBE_*` do `.env`) e
  inspecionar o IndexedDB (`epgPrograms` da geração ativa e `epgChannelId`
  dos canais), ou expor algum dado na tela (por exemplo, a contagem de
  programas na aba EPG).

## Recommendation

Reabrir: o sintoma ainda reproduz na TV com o fix instalado. Rodar a fase
Assess de novo com esta evidência ("vinculado, recente" + guia vazio) e
investigar a gravação e a leitura (candidatos 1–3), reproduzindo no navegador
com a fonte real. O fix atual pode ficar: ele corrige um defeito real no
gatilho da sincronização, só não é a causa toda.
