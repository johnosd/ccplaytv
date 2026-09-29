# Quickstart — 029 Áudio, legendas e info do stream

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- `npm run dev` rodando (http://localhost:5173) para os roteiros E2E.
- Para o spike e a passada física: TV de referência QN50Q60DAGXZD na rede,
  skill `tizen-tv` (build com o perfil Samsung, `sdb install`, launch), e
  uma fonte real que tenha **pelo menos um item com 2+ faixas de áudio e
  uma legenda embutida** (VOD de painel Xtream costuma ter; anotar qual item
  foi usado **sem** URL nem credencial).

## Spike (Fase 1 do sdd-execute) — confirmar a API do AVPlay

Objetivo: fechar R-001–R-004 do `plan.md` antes de construir sobre o
adaptador. Tudo pelo Web Inspector remoto (`tizen-tv`, coleta de evidência),
com um conteúdo **tocando**:

1. `webapis.avplay.getState()` → deve ser `PLAYING`.
2. `webapis.avplay.getTotalTrackInfo()` → anotar, por faixa: `type`,
   `index`, o **texto bruto** de `extra_info` (sem nenhuma URL).
   Conferir: AUDIO traz `language`/`channels`/`fourCC`? TEXT traz
   `track_lang`/`subtitle_type`?
3. `webapis.avplay.getCurrentStreamInfo()` → a faixa AUDIO ativa aparece?
   VIDEO traz `Width`/`Height`/`fourCC`/`Bit_rate`? Algum campo de FPS?
4. `webapis.avplay.getStreamingProperty('CURRENT_BANDWIDTH')` → valor e
   unidade (bps?). Também `IS_LIVE` num canal.
5. `webapis.avplay.setSelectTrack('AUDIO', <outro index>)` → o áudio troca
   sem reiniciar? Repetir **pausado** (R-002).
6. `webapis.avplay.setSilentSubtitle(false)`; `setSelectTrack('TEXT', <index>)`;
   instalar temporariamente `onsubtitlechange` num listener de teste que
   só faça `console.log(duration, text.length)` — **nunca** logar a URL. As
   linhas chegam? `duration` em ms?
7. `webapis.avplay.setSubtitlePosition(-500)` com legenda **embutida** →
   alguma mudança perceptível? (R-003)
8. Repetir 2–5 num **canal ao vivo** com mais de um áudio, se houver.

Registrar o resultado de cada passo em `plan.md` → `Riscos e Decisões`
(R-001…R-004) e em `Execution Notes`. Passo não executado = "não testado".
Sem acesso à TV: pular o spike, registrar, e seguir pela referência
(`logic §1.2`).

## Checagens automatizadas

Em `tv-web/`:

```powershell
npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx   # 5/5
npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx          # 5/5 (027, emendado)
npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx      # 4/4 (020)
npx tsc -b
npm run lint
npm run test
npm run build:tizen
```

Na raiz:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 029-audio-legendas-info-player
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 020-ciclo-vida-player
```

## Cenário ponta a ponta (navegador, E2E)

Com `npm run dev` rodando: `node e2e/audio-legendas-info.mjs`, que injeta um
`webapis.avplay` falso e cobre:

1. **Filme com 2 áudios + 1 legenda**: chrome → "Áudio e legendas" → painel
   com "Português" marcado; ↓ + OK em "Inglês" → marcação muda, sem voltar
   ao início; RETURN → foco no botão.
2. **Legenda**: ligar "Português" → o fake dispara `onsubtitlechange` → texto
   aparece sobre o vídeo; "+500 ms" → a próxima linha aparece ~500 ms depois;
   "-500 ms" → só explica (soft disabled); "Desativadas" → some.
3. **Info**: "Info do stream" → Resolução/Codec/Taxa de bits/Conexão; sem
   FPS/Buffer/Protocolo; "Fechar" → foco no botão.
4. **Live + zapping**: escolher áudio "Inglês" num canal, trocar por ↓ →
   o canal seguinte começa em "Inglês"; abrir o zapping (OK na faixa) → a
   legenda não aparece por cima da lista.
5. **Sem motor de faixas** (sem o fake, `<video>`): botão "Áudio e legendas —
   indisponível" explica e não abre nada.

Depois: `node e2e/player-chrome.mjs` e `npm run test:e2e` (tudo verde).

## Passada na TV física (recomendada, não gate — SC-006)

Na QN50Q60DAGXZD, com a fonte real:

- [ ] VOD com várias faixas: trocar o áudio pelo painel (tocando e pausado).
- [ ] Ligar a legenda embutida: aparece sobre o **plano de hardware**,
  legível, sem cobrir o chrome; some com "Desativadas".
- [ ] "+500 ms" desloca de forma perceptível.
- [ ] Info do stream mostra resolução/codec/taxa real e atualiza.
- [ ] Próximo episódio (botão e autoplay) mantém áudio/legenda por idioma.
- [ ] Canal ao vivo: painel abre; trocar de canal mantém o idioma se existir.
- [ ] Nenhum áudio residual/legenda presa ao fechar o player.

Resultado de cada item em `plan.md` (`Estado Atual`); "não testado" nunca
vira "aprovado".

## Itens cross-cutting (constitution)

- [ ] Nenhuma URL/credencial no painel de info, em toast ou em log novo
  (revisão de segredos antes do commit: `avplayAdapter.ts` não repassa erro
  bruto, o spike não deixou `console.log` no código).
- [ ] Todo estado do painel tem um focável; RETURN fecha o painel antes do
  player.
- [ ] `findUnnamedControls` (feature 028) sem achados nos dois painéis.
- [ ] Documentação atualizada: `CLAUDE.md`, `backlog.md` (item 55: 55a
  entregue, 55b pendente), `.planning/migracao-design-system-v14.md` (mocks
  removidos).
