# Assessment Problem: EPG para de atualizar depois da primeira carga

- **Slug**: epg-atualizacao-periodica
- **Criado**: 2026-10-09
- **Explora**: não rodada (a evidência de código está resumida abaixo, em "Leitura do código")

## Problem Statement

Numa lista Xtream (EPG do painel, `xmltv.php`), o guia de programação fica
vazio depois de algum tempo, mesmo com o usuário fechando e reabrindo o app
e escolhendo a lista de novo — sinal de que a programação foi baixada uma vez
e não está sendo renovada.

## Sintoma relatado (usuário, 2026-10-09)

- **O que viu**: o guia ficou vazio depois (canais sem programação / guia
  acabando antes do fim) — não programação errada.
- **Como usa**: fecha e reabre o app, escolhendo a lista na tela de perfis.
- **Origem do EPG**: painel Xtream (`xmltv.php`, endereço montado pelo app).

## Leitura do código (2026-10-09, só leitura)

O mecanismo de renovação **existe**, mas depende de condições que podem
falhar sem que a pessoa perceba:

1. **Guardamos uma janela fixa**: cada sincronização grava só de 12 h antes a
   48 h depois do instante da sincronização (`lib/epg/epgSync.ts`,
   `BEFORE_HOURS`/`AFTER_HOURS`). Sem uma nova sincronização bem-sucedida em
   até ~48 h, o guia esvazia — é exatamente o sintoma relatado.
2. **Ao abrir a lista, o EPG depende da importação terminar**:
   `useOpenSource` (`features/import/importApi.ts` ~l. 487–500) só checa
   `isEpgStale` (> 12 h) quando `decideOnOpen` devolve `none`. Desde o bug
   `lista-xtream-nao-atualiza-novos-filmes`, `decideOnOpen` devolve
   `update_by_age` sempre que a última importação passou de 10 min
   (`REFRESH_ON_OPEN_MIN_MS`, `lib/catalog/freshness.ts`) — ou seja, quase
   toda abertura vai pelo ramo da importação, e o ramo do EPG vencido
   praticamente nunca roda.
3. **No ramo da importação, o EPG só sincroniza se ela terminar
   `completed`** (`importApi.ts` ~l. 287). Importação `failed` ou
   `cancelled` (conta recusada, rede, app fechado no meio, Worker morto)
   **não dispara EPG nenhum** — e, como o ramo de "EPG vencido" foi pulado,
   nada compensa. Se a importação falha de forma recorrente, o EPG nunca mais
   é renovado.
4. **A própria sincronização do EPG pode falhar em silêncio para a tela**:
   o erro (rede, `refused`, `unreadable`, `storage_full`) fica só no estado
   da fonte em Configurações › Fontes IPTV (`EPG-02`); o guia continua
   mostrando a programação antiga até ela sair da janela. Um `xmltv.php`
   grande baixado e lido na TV é o candidato natural a falhar (tempo, memória).
5. **Não há renovação periódica** enquanto o app fica aberto — mas, pelo uso
   relatado (fecha e reabre), este não é o caminho do sintoma.

Nada disso foi **reproduzido** ainda: são hipóteses de mecanismo, não causa
confirmada (ver `decision.md`).

## Usuários / Partes Afetadas

- Quem assiste TV ao vivo com EPG do painel — perde "Agora/A seguir", barra
  de progresso, guia completo e catch-up dependente de programação.
- Toda fonte cuja importação ao abrir falha ou é cancelada com frequência —
  o EPG fica refém dela.

## Goals

- Confirmar a causa real na TV (qual dos caminhos 2–4 acontece de fato).
- Garantir que, a cada abertura da lista com EPG vencido, uma sincronização
  de EPG aconteça **independentemente** do desfecho da importação do catálogo.
- Se a sincronização do EPG falhar, isso não pode deixar o guia esvaziar sem
  nenhum sinal fora de Configurações.

## Non-Goals

- Mudar a janela guardada (12 h / 48 h) ou o prazo de vencimento (12 h) — só
  se a investigação mostrar que eles são a causa.
- Renovação periódica com o app aberto (timer) — fora do uso relatado; pode
  virar ideia separada.
- EPG manual / `url-tvg` (o bug `epg-manual-falha-ao-salvar-epg-02` cuida
  do manual).
- Reescrever o leitor de XMLTV ou o armazenamento por geração.

## Success Metrics

- Abrindo a lista com EPG > 12 h, `epgLastSyncAt` avança (ou `epgLastErrorAt`
  é registrado) **mesmo quando a importação do catálogo falha ou é cancelada**
  — coberto por teste automatizado.
- Na TV física, depois de 2+ dias de uso "fecha e reabre", o guia continua
  com programação de agora em diante.
- Uma sincronização de EPG que falha fica visível no guia/Live TV (não só em
  Configurações) — se a investigação confirmar o caminho 4.

## Cost of Inaction

O guia esvazia em ~48 h em uso normal, levando junto "Agora/A seguir", o
guia completo (feature 031) e o catch-up que depende da programação — as
features 030/031 deixam de entregar o que prometem, sem aviso ao usuário.
