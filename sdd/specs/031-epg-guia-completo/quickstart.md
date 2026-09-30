# Quickstart — 031-epg-guia-completo

## Pré-requisitos

- Feature `030-epg-dados-agora` entregue (programação, `useEpgPrograms`, tela de EPG).
- `tv-web/`: `npm install` feito; `npm run dev` **recém-iniciado** em `http://localhost:5173` (um servidor
  antigo deixa os roteiros E2E instáveis).
- `.env` na raiz com `CCPLAY_PROBE_USER/PASS/DNS` (painel Xtream real) para o roteiro com dado real —
  lidos em tempo de execução, **nunca** impressos, logados ou copiados (constitution; ADR-010).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/features/live/guide src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx src/components/PlayerLayer.epg-guia-completo.contract.test.tsx   # contratos (5)
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 031-epg-guia-completo    # da raiz; trava íntegra
npx tsc -b
npm run lint
npm run test
npm run build:tizen
npm run test:e2e                                  # inclui e2e/epg-guia-completo.mjs (fixture fictícia)
node e2e/epg-guia-completo-real.mjs               # dado real do .env; fora do test:e2e
```

Travas de outras features que esta toca (devem seguir íntegras **sem edição**): 027
(`PlayerLayer.player-chrome`), 029 (`PlayerLayer.audio-legendas-info`), 024
(`LiveScreen.live-tv-ds-v14`), 018 (`LiveScreen.busca-categoria`), 030 (`LiveScreen.epg-dados-agora`).

## Cenário ponta a ponta (navegador)

Use a lista de teste do E2E fictício (M3U com `url-tvg` → XMLTV gzip, ver `e2e/epg-dados-agora.mjs`) ou a
lista real do `.env` com **★ Favoritos** contendo canais que têm programação (o XMLTV do painel de
referência só cobre 10 ids de canal).

1. Live TV → entrar numa categoria → focar o **2º** canal → `→` (preview) → `↓ ↓` → OK em "Guia completo".
   Esperado: guia em tela cheia, foco no programa atual **desse** canal, painel do topo com título, horário,
   "Agora" e sinopse (US1/AC1, FR-006/FR-009).
2. Conferir: marcador "Agora" no programa em exibição de cada canal, linha vertical da hora atual, programas
   encerrados esmaecidos, canal sem EPG com bloco "Sem programação" (US1/AC2-3, FR-002/FR-003/FR-007).
3. `←/→`: anda programa a programa, a linha do tempo rola; `↑/↓`: troca de canal na mesma hora; voltar
   até o início da janela (−12 h) e avançar até o fim (+48 h), sem passar (US2/AC1-2/AC7).
4. Barra do topo: `↑` na 1ª linha → foco na barra; OK em "Amanhã" → salta para o início de amanhã; OK em
   "Hoje" → volta ao agora; a aba ativa acompanha o dia da hora focada (US2/AC3, FR-004/FR-016).
5. OK em programa atual/futuro → o canal abre em tela cheia; `↑/↓` no player percorrem a lista do guia
   (US2/AC5, FR-020). OK em programa encerrado → só o aviso "Este programa já terminou." (US2/AC6).
6. RETURN no guia (aberto do preview) → Live TV com o foco na lista, no canal de origem (US1/AC4, FR-012).
7. Tocando um canal: OK na faixa → `→` → "Guia" (sem "em breve") → OK: o guia abre por cima, o **áudio
   continua**; RETURN volta ao vídeo sem reabrir a sessão; escolher outro canal troca a reprodução e o guia
   só fecha quando o novo canal está tocando (US3/AC1-3, FR-010/FR-022).
8. Seletor de lista (barra → primeiro item): "★ Favoritos", "Todos" e as categorias; escolher uma categoria
   nunca aberta → carregamento com foco possível → grade; em "Todos", o cabeçalho diz "X de Y categorias"
   (US4). Sem foco preso em nenhum estado (carregando, vazio, erro).
9. Em Configurações desativar o EPG da lista → abrir o guia: explicação + "Configurar EPG" que leva à tela
   de EPG (FR-013). Reativar → guia com dado.
10. CH+/CH− paginam os canais (FR-015), no guia parado e no aberto do player.
11. DevTools › Network durante todo o roteiro: **nenhuma** requisição de EPG ao mover o foco (FR-018); nenhum
    endereço em console.

## Passada na TV física (recomendada, não gate)

`tizen-tv`: repetir 1, 3, 5, 7 na QN50Q60DAGXZD. Observar: **guia opaco sobre o plano de hardware do AVPlay**
com o áudio seguindo (R-002); fluidez segurando `↓`/`→` com centenas de canais (SC-002, R-003); CH± chegando
ao guia; a hora atual cruzando a meia-noite.

## Itens cross-cutting da constitution

- Todo estado do guia com elemento focável; exatamente um foco visível; `.no-scale` nos blocos.
- RETURN em camadas: seletor → guia → (Live TV | vídeo).
- Nada de texto de programa que não venha da programação guardada; nenhum endereço de EPG em tela/log.
