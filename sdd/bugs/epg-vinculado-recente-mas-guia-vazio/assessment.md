# Bug Assessment: EPG "vinculado, recente" mas guia e "Agora" vazios

- **Slug**: epg-vinculado-recente-mas-guia-vazio
- **Criado**: 2026-10-15
- **Origem**: reabertura de `epg-nao-atualiza-depois-primeira-carga` (Test: `failed`, evidência da TV física) + relatório externo de análise de código (colado, 2026-10-15), item 2.1
- **Veredito**: likely valid, needs reproduction
- **Severidade**: high

## Report

Continuação direta de `sdd/bugs/epg-nao-atualiza-depois-primeira-carga/`. Com o
fix daquele bug instalado (build de 2026-10-10, commit `c76c125`), o usuário viu
na TV física: Guia de Programação e faixa "Agora" **vazios**, sem mensagem de
erro, enquanto Configurações › Fontes IPTV mostra o EPG **"vinculado", com data
de sincronização recente**. O `test.md` daquele bug listou três candidatos à
segunda causa, só pelo código (nenhum verificado):

1. sucesso registrado com 0 programas;
2. ids de canal que não casam (`epgChannelId` perdido nos blocos 039/renovação 038, ou diferença de grafia);
3. `epgActiveGeneration` ausente ou divergente.

O relatório externo repete 1 e 2, e para 2 propõe normalizar com `trim` +
`lowercase` nas duas pontas.

## Symptom

Observado (TV física): o estado do EPG diz sincronizado e em dia, mas nenhum canal
mostra programação. Esperado: com "vinculado, recente", os canais cujo id de EPG
está no XMLTV mostram "Agora/A seguir" e o guia.

## Reproduction

**Fora da TV o sintoma NÃO reproduz** (2026-10-15, credenciais `CCPLAY_PROBE_*`
do `.env`, valores não registrados; sondas em scratchpad, só contagens):

1. `npm run dev` + Chromium (Playwright) com cadastro novo da lista Xtream real →
   "EPG vinculado" na tela. Inspeção direta do IndexedDB `ccplaytv`:
   - `activeGeneration` 1, `epgActiveGeneration` 1, `epgLastErrorKind` nulo, deslocamento 0;
   - **10.824 programas** na geração ativa (só ela existe), **131** ids de canal distintos, **123** com programa no ar agora;
   - depois de entrar em 5 categorias e 30 s de prefetch: 42 blocos de canais, 2.355 itens, 963 com `epgChannelId`, 172 ids distintos;
   - **131 dos 131** ids do XMLTV casam por igualdade exata com `epgChannelId` dos canais; 123 com programa agora; **0** casam só ignorando caixa; **0** ids com espaço sobrando.
2. Pedido direto ao painel imitando a TV (User-Agent Tizen 9 / Chromium 120, `Origin: null` de `file://`):
   - `xmltv.php` → 200, `Access-Control-Allow-Origin: *`, 14,8 MB, raiz `<tv>`, **40.877 programas**, 135 ids de canal, todos os **135** presentes entre os 172 `epg_channel_id` de `get_live_streams`.
3. EPG manual (`CCPLAY_PROBE_EPG`, o servidor do bug `epg-manual-falha-ao-salvar-epg-02`): hoje responde **404** depois de redirecionar. Se estivesse configurado na TV, o estado seria **erro** (`network`), não "vinculado" — não explica o sintoma atual.

Ou seja: com cadastro novo, a gravação, a geração ativa e o casamento de ids
funcionam, e o painel entrega a programação para um pedido no formato da TV. O
que falha é específico do aparelho e **não é observável** hoje (a TV não tem
console, e a tela não expõe nenhum número do EPG).

[NEEDS CLARIFICATION: qual lista está ativa na TV quando o guia aparece vazio —
a mesma Xtream do `.env`, outra Xtream, ou uma M3U com `url-tvg`? Uma M3U cujo
`tvg-id` não bate com o XMLTV declarado dá exatamente "vinculado" + guia vazio,
e aí é dado do provedor, não código.]

[NEEDS CLARIFICATION: a lista da TV tem EPG manual configurado (Configurações ›
EPG)? O manual tem prioridade sobre o do painel (`resolveEpgUrl`).]

## Suspected Code Paths

- `tv-web/src/lib/epg/epgSync.ts:79-91` — `recordEpgSuccess` roda com qualquer `programCount`, inclusive 0. Um XMLTV com raiz `<tv>` mas sem programas na janela (−12 h/+48 h), um corpo truncado depois do `<tv`, ou datas que `parseXmltvTime` recusa terminam como `synced` → "vinculado, recente". **Defeito certo no código**; que seja a causa na TV não está provado.
- `tv-web/src/lib/epg/epgRepository.ts:59-100` (`writeEpgPrograms`) — publica a geração nova e apaga a anterior **mesmo com 0 programas**: uma sincronização "vazia" substitui uma programação boa por nada.
- `tv-web/src/lib/epg/epgStatus.ts:95-114` (`epgStatusOf`) e `tv-web/src/features/sources/sourceFormat.ts:44-68` (`formatEpgStatus`) — "vinculado" só olha `epgLastSyncAt`; não há contagem de programas nem de canais casados persistida ou exibida, por isso a TV não consegue distinguir os candidatos.
- `tv-web/src/lib/epg/nowNext.ts:68-77` e `tv-web/src/features/catalog/catalogApi.ts:108-132` (`useEpgPrograms`) — leitura por igualdade exata (FR-008). Verificado acima: casa 100% com dado real.
- `tv-web/src/lib/catalog/categoryBlocks.ts:150-170` (`toBlockItem`) — preserva `epgChannelId` (spread de todos os campos); `itemsSignature` inclui o campo, então uma renovação regrava blocos sem ele. Descartado como causa num cadastro novo.

## Root Cause Hypothesis

Os candidatos 2 e 3 do `test.md` estão **descartados para um cadastro novo**: num
Chromium com a lista real, a geração ativa existe, tem programas, e todos os ids
casam por igualdade exata. A normalização `lowercase` proposta pelo relatório
externo não é necessária (0 casos) e iria **contra** o FR-008 (id exato) da
feature 030 — fica fora. Resta o que difere na TV: (a) o próprio download/leitura
no Worker do aparelho produzir 0 programas, que o app registra como sucesso
(candidato 1 — compatível com tudo que se observou); (b) estado antigo do
IndexedDB da TV (lista cadastrada há muitas versões) que um cadastro novo não
reproduz; (c) uma lista diferente da usada aqui, com ids que de fato não casam.
**Confiança: low** sobre qual delas é; **high** sobre o defeito de (a) existir no
código. Sem um número na tela, a TV não deixa escolher entre elas.

## Proposed Remediation

**Preferida — corrigir o defeito certo e tornar o resto visível na TV:**

1. **Sincronização com 0 programas não é sucesso.** Em `writeEpgPrograms`, se
   `programCount === 0`, não publicar a geração nova: descartar o parcial e
   manter a ativa (mesmo tratamento de uma falha no meio). Em `syncEpg`, registrar
   falha com uma categoria nova `EpgErrorKind = 'empty'` (código visível próprio,
   mensagem nos 3 idiomas: "a fonte de programação não trouxe programas para as
   próximas horas"), nunca `recordEpgSuccess`.
2. **Gravar o que a sincronização trouxe.** No sucesso, persistir na fonte
   `epgProgramCount` e `epgChannelCount` (ids de canal distintos gravados) —
   contagens, nada de conteúdo.
3. **Mostrar na TV.** Em Configurações › EPG (`EpgSettingsScreen`), junto do
   estado: "N programas · M canais" e, lido sob demanda do aparelho, **quantos
   canais da lista têm programação** (ids de EPG dos blocos carregados que existem
   na geração ativa) — o número que separa (a), (b) e (c) numa olhada, sem console.
   Mostrar também a origem do endereço (painel / lista / manual), se ainda não
   aparece.

Depois do fix, a fase Test vai exigir a TV física: se a tela mostrar `empty`, a
causa é (a) e a investigação passa a ser o download/leitura no aparelho; se mostrar
programas e 0 canais casados, é (b)/(c).

**Alternativas**:
- Só o item 1, sem diagnóstico na tela — corrige o defeito, mas se a causa for
  (b) ou (c) a TV continua "vinculado" e vazia sem pista nenhuma.
- Normalizar ids com `lowercase` (relatório externo) — rejeitada: 0 casos no dado
  real e contraria FR-008.
- Sonda/console remoto na TV (Web Inspector via `sdb`) — a skill `tizen-tv`
  registra que não há console utilizável; fica como plano B se o diagnóstico na
  tela não bastar.

**Files likely to change**:
- `tv-web/src/lib/epg/epgRepository.ts` (`writeEpgPrograms` sem publicar vazio; gravar contagens no sucesso; função de leitura "canais com programação")
- `tv-web/src/lib/epg/epgSync.ts` (0 programas → `recordEpgFailure('empty')`)
- `tv-web/src/lib/catalog/db.ts` (`EpgErrorKind` + `'empty'`; `epgProgramCount`/`epgChannelCount` opcionais em `SourceRecord` — sem índice, sem nova versão de schema)
- `tv-web/src/lib/epg/epgStatus.ts` + `tv-web/src/lib/epg/types.ts` (status carrega as contagens; mensagem/código de `empty`)
- `tv-web/src/features/settings/EpgSettingsScreen.tsx` (exibir contagens e canais casados)
- `tv-web/src/lib/i18n/messages/*.ts` (textos novos em pt/en/es)
- testes ao lado de cada um

**Tests to add or update**:
- `epgSync`: XMLTV com raiz `<tv>` e 0 programas na janela → `outcome: 'failed'`, `errorKind: 'empty'`, `epgLastSyncAt` não avança, programação anterior intacta.
- `epgRepository`: `writeEpgPrograms` com 0 programas não troca `epgActiveGeneration` nem apaga a geração ativa; sucesso grava `epgProgramCount`/`epgChannelCount`.
- `epgStatus`: `empty` vira `state: 'error'` com mensagem própria nos 3 idiomas.
- `EpgSettingsScreen`: mostra "N programas · M canais" e "X de Y canais com programação"; continua com elemento focável em todos os estados.
- Manter verdes os testes de contrato travados de `epg-dados-agora` (feature 030) — se algum assumir "0 programas = synced", parar e registrar desvio em vez de editar o contrato.

## Risks & Considerations

- **Contrato travado da 030**: `epgSync.epg-dados-agora.contract.test.ts` e afins são imutáveis (`check-contract-tests.ps1`). Se algum fixar o sucesso com 0 programas, a mudança do item 1 exige decisão explícita do usuário, não edição do contrato.
- **Fonte que legitimamente não tem programação na janela** passa a aparecer como erro `empty` em vez de "vinculado". É a informação correta, mas muda o que a pessoa vê; o texto precisa dizer "sem programas para as próximas horas", não "falhou".
- **Tentativa a cada abertura**: com `empty` contando como falha, `isEpgStale` continua vencido e cada abertura baixa o XMLTV de novo (15 MB). Mesmo comportamento já aceito para falhas recorrentes no bug anterior (uma tentativa por abertura, sem laço).
- **Contagem de "canais com programação"** lê blocos e programas: só sob demanda, na tela de EPG, nunca na Live TV nem no foco (constitution: foco não dispara consulta). Só conta blocos já carregados no aparelho; com cobertura parcial (010/038), o "de Y" precisa dizer isso.
- **Segredos**: as contagens são números; nenhum id de canal, nome ou endereço vai para a tela, log ou erro (ADR-010).
- Não mexer na janela 12/48 h, no prazo de 12 h nem no fix do bug anterior (continua correto).

## Open Questions

- [NEEDS CLARIFICATION: lista ativa na TV — mesma Xtream do `.env`, outra Xtream, ou M3U com `url-tvg`?]
- [NEEDS CLARIFICATION: há EPG manual configurado nessa lista na TV?]
- Nenhuma das duas bloqueia o fix proposto: ele vale para qualquer resposta e é o que permite respondê-las na própria TV.
